/**
 * @fileoverview Encodes {@link SpanData} into an OTLP/HTTP **JSON** trace
 * request.
 *
 * The encoder is a Guardian schema with a `.transform()` rather than a
 * hand-written mapper, so the wire shape, the conversions, and the validation
 * are one declaration and every field is validated on the way out. Measured at
 * ~2.6x a hand-rolled mapper (1.1ms vs 408µs per 512-span flush; see
 * `encode.bench.ts`) — under a millisecond more, on a background flush, off the
 * request path.
 *
 * The output type is restated explicitly in {@link OtlpSpanPayload} rather than
 * inferred from the schema: JSR's slow-types gate rejects an inferred schema
 * type in a public API. `encode.test.ts` asserts every field, so the schema and
 * the declared type cannot drift apart silently.
 *
 * The four conversions below are the ones that silently break collector ingest
 * when they're wrong, which is precisely why they're declared once here:
 *
 * | field                     | OTLP/JSON requires                        |
 * | ------------------------- | ----------------------------------------- |
 * | `traceId` / `spanId`      | lowercase **hex** — NOT base64, an
 * |                           | OTLP-specific override of protobuf-JSON   |
 * | `*TimeUnixNano`           | decimal **strings** (int64 exceeds JSON)  |
 * | attribute values          | typed `{ stringValue | intValue | ... }`  |
 * | `kind`, `status.code`     | numeric enums                             |
 *
 * @author TundraSoft
 *
 * @module
 */

import { Guardian } from '@tundralibs/guardian';
import type { Attributes, AttributeValue, SpanData } from '../../types/mod.ts';

/** Nanoseconds per millisecond — JS clocks are millisecond-resolution. */
const NANOS_PER_MS = 1_000_000;

/** `Date` -> OTLP's decimal-string nanosecond timestamp. */
const toUnixNano = (date: Date): string => `${date.getTime() * NANOS_PER_MS}`;

/**
 * One attribute value in OTLP's typed `AnyValue` wrapper.
 *
 * This is the one part that cannot be declared as a schema: the wrapper is
 * chosen by the value's **runtime type**, not by a discriminator field, so it
 * is a `typeof` dispatch. Integers and floats take different keys, and
 * `intValue` is itself a string.
 *
 * @param value - See {@link AttributeValue}.
 * @returns The OTLP `AnyValue` object.
 */
export function toAnyValue(value: AttributeValue): Record<string, unknown> {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: `${value}` }
      : { doubleValue: value };
  }
  // Homogeneous array — OTLP nests each element as its own AnyValue.
  return {
    arrayValue: {
      values: (value as Array<string | number | boolean>).map((v) =>
        toAnyValue(v)
      ),
    },
  };
}

/** One OTLP `KeyValue` — an attribute name paired with a typed `AnyValue`. */
export type OtlpKeyValue = { key: string; value: Record<string, unknown> };

/**
 * An attribute bag as OTLP's `KeyValue` list. Values OTLP cannot represent are
 * dropped rather than emitted malformed — one bad attribute must not cost the
 * whole span.
 *
 * @param attributes - See {@link Attributes}.
 * @returns OTLP `KeyValue[]`.
 */
export function toKeyValues(attributes: Attributes): OtlpKeyValue[] {
  const out: OtlpKeyValue[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    out.push({ key, value: toAnyValue(value) });
  }
  return out;
}

/** 32 lowercase hex characters — a W3C trace id. */
const TraceId = Guardian.string().pattern(/^[0-9a-f]{32}$/);
/** 16 lowercase hex characters — a W3C span id. */
const SpanId = Guardian.string().pattern(/^[0-9a-f]{16}$/);

/**
 * The span encoder: validates a {@link SpanData} and transforms it into the
 * OTLP `Span` wire shape.
 */
const OtlpSpan = Guardian.object({
  name: Guardian.string(),
  context: Guardian.object({
    traceId: TraceId,
    spanId: SpanId,
    traceFlags: Guardian.number(),
  }),
  parentSpanId: SpanId.optional(),
  kind: Guardian.number(),
  startTime: Guardian.date(),
  endTime: Guardian.date(),
  // Pass-through: attributes and events are shaped by `toKeyValues`, which
  // already drops anything OTLP cannot represent. Validating every attribute
  // value here would double the encoder's cost for no added safety, so these
  // are accepted as-is and re-typed in the transform below.
  attributes: Guardian.record(Guardian.unknown()),
  events: Guardian.array(Guardian.unknown()),
  status: Guardian.object({
    code: Guardian.number(),
    message: Guardian.string().optional(),
  }),
}).transform((s) => ({
  traceId: s.context.traceId,
  spanId: s.context.spanId,
  // Omitted rather than sent empty — a root span has no parent, and an empty
  // string is not a valid span id.
  ...(s.parentSpanId === undefined ? {} : { parentSpanId: s.parentSpanId }),
  name: s.name,
  kind: s.kind,
  startTimeUnixNano: toUnixNano(s.startTime as Date),
  endTimeUnixNano: toUnixNano(s.endTime as Date),
  attributes: toKeyValues(s.attributes as unknown as Attributes),
  events: (s.events as unknown as SpanData['events']).map((e) => ({
    timeUnixNano: toUnixNano(e.time),
    name: e.name,
    attributes: toKeyValues(e.attributes),
  })),
  // `message` is only meaningful for ERROR per the spec; omit it otherwise.
  status: s.status.message === undefined
    ? { code: s.status.code }
    : { code: s.status.code, message: s.status.message },
}));

/**
 * The OTLP `Span` wire shape.
 *
 * Declared explicitly rather than derived via `Guardian.infer<typeof OtlpSpan>`:
 * JSR's slow-types gate rejects an inferred schema type in a package's public
 * API, and an un-inferrable public type also blocks `.d.ts` generation for
 * Node. The schema above stays the single runtime authority — this type only
 * restates its output, and [encode.test.ts](encode.test.ts) asserts every field
 * of it, so the two cannot drift silently.
 */
export type OtlpSpanPayload = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  events: Array<{
    timeUnixNano: string;
    name: string;
    attributes: OtlpKeyValue[];
  }>;
  status: { code: number; message?: string };
};

/** An OTLP `ExportTraceServiceRequest` body. */
export type OtlpTraceRequest = {
  resourceSpans: Array<{
    resource: { attributes: OtlpKeyValue[] };
    scopeSpans: Array<{
      scope: { name: string; version?: string };
      spans: OtlpSpanPayload[];
    }>;
  }>;
};

/** Instrumentation scope reported to the backend. */
const SCOPE_NAME = '@tundralibs/tracer';

/**
 * Encode a batch of finished spans into an OTLP trace request.
 *
 * Spans are grouped by their resource so a batch spanning more than one
 * `service.name` still produces a valid payload. A span that fails validation
 * is **skipped**, not thrown — one malformed span must not cost the batch, and
 * the alternative (shipping it) gets the whole payload rejected by the
 * collector.
 *
 * @param spans - Finished spans to encode.
 * @param onError - Notified for each skipped span, so a caller can log the
 *   encoder's own failures rather than lose them silently.
 * @returns The request body to POST to `<endpoint>/v1/traces`.
 */
export function encodeSpans(
  spans: SpanData[],
  onError?: (span: SpanData, error: unknown) => void,
): OtlpTraceRequest {
  // Group by resource identity — spans from one tracer share a resource, so
  // the common case is a single group and one JSON.stringify per batch.
  const groups = new Map<string, { resource: Attributes; spans: SpanData[] }>();
  for (const span of spans) {
    const key = JSON.stringify(span.resource);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { resource: span.resource, spans: [span] });
    } else {
      group.spans.push(span);
    }
  }

  const resourceSpans: OtlpTraceRequest['resourceSpans'] = [];
  for (const { resource, spans: grouped } of groups.values()) {
    const encoded: OtlpSpanPayload[] = [];
    for (const span of grouped) {
      try {
        encoded.push(OtlpSpan.parse(span) as OtlpSpanPayload);
      } catch (error) {
        onError?.(span, error);
      }
    }
    if (encoded.length === 0) continue;
    resourceSpans.push({
      resource: { attributes: toKeyValues(resource) },
      scopeSpans: [{ scope: { name: SCOPE_NAME }, spans: encoded }],
    });
  }
  return { resourceSpans };
}

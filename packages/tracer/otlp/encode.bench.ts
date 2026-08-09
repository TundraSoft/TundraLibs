/// <reference lib="deno.ns" />
/**
 * @fileoverview The measurement behind the encoder's design.
 *
 * `encode.ts` builds the OTLP payload from a Guardian schema with a
 * `.transform()` rather than a hand-written mapper. That buys one declaration
 * for shape + conversion + validation and a derived output type, at the cost of
 * per-value validation on every flush — so the choice was made on data, not
 * taste.
 *
 * Result at the time of writing (512 spans x 10 attributes, the default batch
 * size): hand-rolled ~0.50ms, Guardian ~1.06ms — about **2x**, but only
 * ~0.5ms more per flush, and flushes happen on a background timer rather than
 * on the request path. The absolute cost is immaterial; the single source of
 * truth is not.
 *
 * Re-run with `deno bench packages/tracer` if that trade ever looks different.
 *
 * @module
 */

import { encodeSpans, toKeyValues } from './mod.ts';
import { SpanKind, SpanStatusCode } from '../types/mod.ts';
import type { Attributes, SpanData } from '../types/mod.ts';

const NANOS_PER_MS = 1_000_000;

/** The mapper Guardian replaced — kept only as the benchmark's baseline. */
const handRolled = (s: SpanData) => ({
  traceId: s.context.traceId,
  spanId: s.context.spanId,
  ...(s.parentSpanId === undefined ? {} : { parentSpanId: s.parentSpanId }),
  name: s.name,
  kind: s.kind,
  startTimeUnixNano: `${s.startTime.getTime() * NANOS_PER_MS}`,
  endTimeUnixNano: `${s.endTime.getTime() * NANOS_PER_MS}`,
  attributes: toKeyValues(s.attributes),
  events: s.events.map((e) => ({
    timeUnixNano: `${e.time.getTime() * NANOS_PER_MS}`,
    name: e.name,
    attributes: toKeyValues(e.attributes),
  })),
  status: s.status.message === undefined
    ? { code: s.status.code }
    : { code: s.status.code, message: s.status.message },
});

/** One default-sized batch of realistically-shaped spans. */
const BATCH: SpanData[] = Array.from({ length: 512 }, (_, i) => ({
  name: `op-${i}`,
  context: {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    traceFlags: 1,
  },
  parentSpanId: i === 0 ? undefined : '00f067aa0ba902b8',
  kind: SpanKind.SERVER,
  startTime: new Date(1_700_000_000_000),
  endTime: new Date(1_700_000_000_120),
  attributes: Object.fromEntries(
    Array.from({ length: 10 }, (_, k) => [
      `attr.${k}`,
      k % 3 === 0 ? `value-${k}` : k % 3 === 1 ? k : k % 2 === 0,
    ]),
  ) as Attributes,
  events: [],
  status: { code: SpanStatusCode.UNSET },
  resource: { 'service.name': 'bench' },
}));

Deno.bench('otlp encode — Guardian transform (shipped)', () => {
  encodeSpans(BATCH);
});

Deno.bench('otlp encode — hand-rolled baseline', () => {
  BATCH.map(handRolled);
});

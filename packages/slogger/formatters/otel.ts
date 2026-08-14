/**
 * @fileoverview `otelLogFormatter` — render a `SlogObject` as an
 * OpenTelemetry log-record JSON line.
 *
 * Field mapping follows the OTel logs data model:
 * https://opentelemetry.io/docs/specs/otel/logs/data-model/
 *
 * | OTel field          | Source                                       |
 * |---------------------|----------------------------------------------|
 * | `timeUnixNano`      | `log.timestamp * 1_000_000` (ms → ns)        |
 * | `severityNumber`    | mapped from syslog severity (see below)      |
 * | `severityText`      | OTel name for the mapped severity number     |
 * | `body`              | `log.message`                                |
 * | `attributes`        | flattened `log.context` (dot-path keys)      |
 * | `resource`          | `{ 'service.name': appName, 'host.name': hostname }` (+ caller-supplied) |
 *
 * Optional `traceId` / `spanId` can be threaded through the
 * SlogObject's context (`context.traceId`, `context.spanId`) — when
 * present they're hoisted to top-level OTel fields and removed from
 * `attributes`.
 *
 * The wire format is single-line JSON, suitable for HTTP push to an
 * OTel collector's `/v1/logs` endpoint (one line per record) or for
 * any aggregator that consumes OTel logs as NDJSON.
 *
 * @module
 */

import { SyslogSeverities } from '@tundralibs/utils';
import type { SloggerFormatter, SlogObject } from '../types/mod.ts';
import { makeReplacer } from './jsonFormatter.ts';

/**
 * Placeholder emitted where the attributes reference one of their own
 * ancestors (a cycle) — recursing would never terminate, and the
 * resulting `RangeError` would be swallowed by `Slogger.log()` and drop
 * the whole record.
 */
const CIRCULAR_PLACEHOLDER = '[Circular]';

/** Options for {@link otelLogFormatter}. */
export type OtelLogOptions = {
  /**
   * Extra `resource` attributes to merge with the auto-derived
   * `service.name` (from `log.appName`) and `host.name` (from
   * `log.hostname`). Caller-supplied keys override the auto ones.
   *
   * Typical fields:
   * - `'service.version'`
   * - `'service.namespace'`
   * - `'deployment.environment'`
   * - `'host.id'`
   */
  resource?: Record<string, unknown>;

  /**
   * Override the keys used to extract trace / span IDs from
   * `log.context`. Set to `null` to disable hoisting (everything
   * stays in `attributes`).
   *
   * @default { traceId: 'traceId', spanId: 'spanId', traceFlags: 'traceFlags' }
   */
  traceFields?:
    | null
    | {
      traceId?: string;
      spanId?: string;
      traceFlags?: string;
    };
};

/**
 * Map syslog severity (0–7) to OTel SeverityNumber (1–24).
 *
 * https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 *
 * | Syslog            | OTel SeverityNumber | severityText |
 * |-------------------|---------------------|--------------|
 * | DEBUG (7)         | 5                   | DEBUG        |
 * | INFO (6)          | 9                   | INFO         |
 * | NOTICE (5)        | 10                  | INFO2        |
 * | WARNING (4)       | 13                  | WARN         |
 * | ERROR (3)         | 17                  | ERROR        |
 * | CRITICAL (2)      | 18                  | ERROR2       |
 * | ALERT (1)         | 21                  | FATAL        |
 * | EMERGENCY (0)     | 22                  | FATAL2       |
 *
 * @internal
 */
const _SEVERITY_MAP: Record<
  SyslogSeverities,
  { number: number; text: string }
> = {
  [SyslogSeverities.EMERGENCY]: { number: 22, text: 'FATAL2' },
  [SyslogSeverities.ALERT]: { number: 21, text: 'FATAL' },
  [SyslogSeverities.CRITICAL]: { number: 18, text: 'ERROR2' },
  [SyslogSeverities.ERROR]: { number: 17, text: 'ERROR' },
  [SyslogSeverities.WARNING]: { number: 13, text: 'WARN' },
  [SyslogSeverities.NOTICE]: { number: 10, text: 'INFO2' },
  [SyslogSeverities.INFO]: { number: 9, text: 'INFO' },
  [SyslogSeverities.DEBUG]: { number: 5, text: 'DEBUG' },
};

/**
 * Flatten nested context using OTel attribute conventions —
 * dot-path keys, scalar values. Arrays and Dates are preserved
 * as-is so the JSON encoder emits them natively (array → JSON array,
 * Date → ISO string via toJSON()).
 *
 * @internal
 */
const _flattenAttributes = (
  obj: Record<string, unknown>,
  prefix: string,
  out: Record<string, unknown>,
  skipKeys: ReadonlySet<string>,
  seen: WeakSet<object>,
): void => {
  for (const k of Object.keys(obj)) {
    if (!prefix && skipKeys.has(k)) continue;
    const v = obj[k];
    if (v === undefined) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !(v instanceof Date) &&
      Object.getPrototypeOf(v) === Object.prototype
    ) {
      // Guard against a self-referencing context: without ancestor
      // tracking the recursion would overflow the stack (RangeError),
      // which Slogger.log() swallows — dropping the whole record.
      if (seen.has(v)) {
        out[key] = CIRCULAR_PLACEHOLDER;
        continue;
      }
      seen.add(v);
      _flattenAttributes(
        v as Record<string, unknown>,
        key,
        out,
        skipKeys,
        seen,
      );
      seen.delete(v);
    } else {
      out[key] = v instanceof Date ? v.toISOString() : v;
    }
  }
};

/**
 * Compile an OTel log-record formatter from {@link OtelLogOptions}.
 *
 * @example
 * ```typescript
 * import { otelLogFormatter, type SlogObject } from '@tundralibs/slogger';
 *
 * declare const slogObject: SlogObject;
 *
 * const fmt = otelLogFormatter({
 *   resource: { 'service.version': '1.2.3', 'deployment.environment': 'prod' },
 * });
 * fmt(slogObject);
 * // {
 * //   "timeUnixNano": "1778478400000000000",
 * //   "severityNumber": 9,
 * //   "severityText": "INFO",
 * //   "body": "user logged in",
 * //   "attributes": { "userId": 42 },
 * //   "resource": { "service.name": "svc", "host.name": "h01", "service.version": "1.2.3", "deployment.environment": "prod" }
 * // }
 * ```
 */
export const otelLogFormatter = (
  options: OtelLogOptions = {},
): SloggerFormatter => {
  const extraResource = options.resource ?? {};
  const traceFieldsOpt = options.traceFields;
  const traceFields = traceFieldsOpt === null ? null : {
    traceId: traceFieldsOpt?.traceId ?? 'traceId',
    spanId: traceFieldsOpt?.spanId ?? 'spanId',
    traceFlags: traceFieldsOpt?.traceFlags ?? 'traceFlags',
  };
  const skipKeys = new Set<string>(
    traceFields
      ? [traceFields.traceId, traceFields.spanId, traceFields.traceFlags]
      : [],
  );

  return (log: SlogObject): string => {
    const sev = _SEVERITY_MAP[log.level] ??
      _SEVERITY_MAP[SyslogSeverities.INFO];

    // OTel expects timeUnixNano as a string (uint64) — ms × 1e6.
    const timeUnixNano = `${log.timestamp}000000`;

    const attributes: Record<string, unknown> = {};
    if (log.context && Object.keys(log.context).length > 0) {
      _flattenAttributes(log.context, '', attributes, skipKeys, new WeakSet());
    }

    const resource: Record<string, unknown> = {
      'service.name': log.appName,
      'host.name': log.hostname,
      ...extraResource,
    };

    const record: Record<string, unknown> = {
      timeUnixNano,
      severityNumber: sev.number,
      severityText: sev.text,
      body: log.message,
      attributes,
      resource,
    };

    // Hoist traceId / spanId / traceFlags out of attributes when
    // present in the source context.
    if (traceFields && log.context) {
      const tid = log.context[traceFields.traceId];
      const sid = log.context[traceFields.spanId];
      const flags = log.context[traceFields.traceFlags];
      if (typeof tid === 'string') record.traceId = tid;
      if (typeof sid === 'string') record.spanId = sid;
      if (typeof flags === 'number') record.traceFlags = flags;
    }

    // Use the shared replacer so a BigInt attribute value (which a bare
    // `JSON.stringify` throws on) is rendered as a decimal string and a
    // circular reference inside an array/object becomes '[Circular]'
    // rather than throwing — a throw here is swallowed by Slogger.log()
    // and drops the whole record.
    return JSON.stringify(record, makeReplacer());
  };
};

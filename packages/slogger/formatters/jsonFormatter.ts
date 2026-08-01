/**
 * JSON formatter — emit the full {@link SlogObject} as a single-line
 * JSON record (NDJSON-friendly). For human-readable indented output,
 * use {@link prettyJsonFormatter} instead.
 *
 * The full SlogObject is serialised by design — see the Vision
 * section of `REVIEW.md`: the rich record is what lets a single log
 * call fan out to console / file / syslog / database / HTTP
 * destinations without recomputing format-specific fields.
 *
 * @module
 */
import type { SloggerFormatter, SlogObject } from '../types/mod.ts';

/**
 * Placeholder emitted where the record references one of its own
 * ancestors (a cycle). Without this guard `JSON.stringify` throws, and
 * because `Slogger.log()` dispatches handlers fire-and-forget with a
 * swallowing `.catch()`, the throw would silently drop the whole log
 * record — the same failure mode {@link maskingFormatter} is hardened
 * against.
 */
const CIRCULAR_PLACEHOLDER = '[Circular]';

/**
 * Build a `JSON.stringify` replacer with per-call cycle detection.
 *
 * A fresh replacer is created per `stringify` call so its ancestor
 * stack is never shared between records. The stack tracks the path
 * from the root to the value currently being serialised: on each call
 * `this` is the object holding `key`, so we pop back to it before
 * testing membership. This distinguishes a true cycle (the value is on
 * the current path) from a shared-but-acyclic reference (a DAG — the
 * value appears in two sibling branches but not as an ancestor), which
 * is serialised normally in both places rather than falsely flagged.
 *
 * Also converts Date → ISO string and BigInt → decimal string (both
 * unsupported by `stringify` itself) and coerces `undefined` → `null`.
 *
 * Exported (module-internal — not re-exported from `formatters/mod.ts`)
 * so the sibling `logfmt` / `otel` formatters share the exact same
 * cycle + BigInt hardening rather than each re-throwing on those inputs
 * (a throw would be swallowed by `Slogger.log()` and drop the record).
 */
export const makeReplacer = (): (
  this: unknown,
  key: string,
  value: unknown,
) => unknown => {
  const ancestors: unknown[] = [];
  return function (this: unknown, _key: string, value: unknown): unknown {
    /* c8 ignore next 3 -- Date.prototype.toJSON converts before the replacer is called */
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    // Coerce `undefined` to `null` so JSON keys aren't silently
    // dropped — helps downstream consumers see explicitly-set-but-empty
    // fields.
    if (value === undefined) {
      return null;
    }
    if (value === null || typeof value !== 'object') {
      return value;
    }
    // Pop the stack back down to the parent of the value being visited
    // (`this`), so `ancestors` holds exactly the current root→here path.
    while (
      ancestors.length > 0 && ancestors[ancestors.length - 1] !== this
    ) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) {
      return CIRCULAR_PLACEHOLDER;
    }
    ancestors.push(value);
    return value;
  };
};

/**
 * Single-line JSON formatter — one log → one line, NDJSON ingestion
 * ready. Use this for FileHandler, HTTPHandler, and any aggregator
 * (ELK, Loki, Datadog, etc.). Cycle-safe: a circular reference in the
 * context is rendered as `'[Circular]'` rather than throwing (which
 * would drop the record).
 */
export const jsonFormatter: SloggerFormatter = (log: SlogObject): string =>
  JSON.stringify(log, makeReplacer());

/**
 * Indented JSON formatter — for `console` and interactive debugging
 * where readability matters more than payload size. Two-space indent.
 * Cycle-safe, like {@link jsonFormatter}.
 */
export const prettyJsonFormatter: SloggerFormatter = (
  log: SlogObject,
): string => JSON.stringify(log, makeReplacer(), 2);

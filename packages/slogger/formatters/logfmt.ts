/**
 * @fileoverview `logfmtFormatter` — render a `SlogObject` in the
 * **logfmt** wire format: `key=value key2="quoted val" key3=42`.
 *
 * logfmt is a structured-but-human-readable line format used widely
 * in the Go ecosystem (Heroku Logplex, Splunk Observability,
 * Datadog log parsing, Promtail, Loki ingestion). Spec / reference:
 * https://brandur.org/logfmt
 *
 * Quoting rules:
 *
 * - Values containing space, `"`, `=`, or any control character are
 *   quoted with `"`.
 * - Inside a quoted value, `"` and `\` are backslash-escaped.
 * - Empty strings are emitted as `=""`.
 * - `null` is emitted as the literal `null`.
 * - `undefined` keys are omitted entirely.
 *
 * Nested context is flattened to dot-path keys: `{user: {id: 1}}`
 * becomes `user.id=1`. Arrays render as JSON literals
 * (`tags=["a","b"]`) — the logfmt spec is silent on arrays, but
 * downstream tools generally accept JSON for that one value.
 *
 * @module
 */

import type { SloggerFormatter, SlogObject } from '../types/mod.ts';
import { makeReplacer } from './jsonFormatter.ts';

/**
 * Placeholder emitted where the context references one of its own
 * ancestors (a cycle) — recursing would never terminate, and the
 * resulting `RangeError` would be swallowed by `Slogger.log()` and drop
 * the whole record.
 */
const CIRCULAR_PLACEHOLDER = '[Circular]';

/** Options for {@link logfmtFormatter}. */
export type LogfmtOptions = {
  /**
   * Field order for the envelope (severity / timestamp / message /
   * app / host). Defaults to a sensible order that puts `ts` and
   * `level` first so log tailing reads naturally.
   *
   * @default ['ts', 'level', 'app', 'host', 'msg', 'context']
   */
  envelopeOrder?: ReadonlyArray<
    'ts' | 'level' | 'app' | 'host' | 'msg' | 'id' | 'context'
  >;

  /**
   * Use the numeric syslog severity (`level=6`) instead of the name
   * (`level=info`). Numeric is denser; name is more readable.
   *
   * @default false (name)
   */
  useNumericLevel?: boolean;

  /**
   * Use epoch-ms (`ts=1778483769120`) instead of ISO string
   * (`ts=2026-05-11T07:16:09.121Z`). Epoch is faster to parse;
   * ISO is human-readable.
   *
   * @default false (ISO)
   */
  useEpochTimestamp?: boolean;
};

const NEEDS_QUOTE = /[\s"=]/;
// deno-lint-ignore no-control-regex
const HAS_CONTROL = /[\x00-\x1f\x7f]/;

/**
 * Encode a context key into its logfmt representation.
 *
 * Keys come from user-controlled context objects, so an unsanitised
 * key containing a space, `=`, `"`, newline or other control byte
 * would let an attacker split the line or inject extra `k=v` pairs
 * (logfmt injection). Keys that need quoting are quoted + escaped
 * with the same rules as values; safe keys pass through unchanged.
 *
 * @internal
 */
const _key = (k: string): string => {
  if (k === '') return '""';
  if (!NEEDS_QUOTE.test(k) && !HAS_CONTROL.test(k)) return k;
  // Quote and escape — JSON.stringify handles `"` + `\` + control bytes.
  return JSON.stringify(k);
};

/**
 * Encode a single value into its logfmt representation.
 *
 * @internal
 */
const _value = (v: unknown): string => {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') {
    if (v === '') return '""';
    if (!NEEDS_QUOTE.test(v) && !HAS_CONTROL.test(v)) return v;
    // Quote and escape — JSON.stringify handles `"` + `\` + control bytes.
    return JSON.stringify(v);
  }
  if (
    typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint'
  ) {
    return String(v);
  }
  // Arrays and plain objects — JSON literal as the value. A bare
  // `JSON.stringify` throws on a nested BigInt ('Do not know how to
  // serialize a BigInt') or a circular reference; the shared replacer
  // renders BigInt → decimal string and a cycle → '[Circular]' so the
  // formatter never throws (a throw is swallowed by Slogger.log() and
  // drops the whole record). Quoted because JSON contains `"` etc.
  return JSON.stringify(v, makeReplacer());
};

/**
 * Flatten a nested record into a flat key→string map using dot-path
 * keys (`user.id=1`). Arrays and `Date` instances are emitted as
 * single values without recursion. `undefined` values are skipped.
 *
 * @internal
 */
const _flatten = (
  obj: Record<string, unknown>,
  prefix: string,
  out: Array<[string, string]>,
  seen: WeakSet<object>,
): void => {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !(v instanceof Date) &&
      // Don't recurse into class instances — they typically don't
      // have meaningful enumerable own properties.
      Object.getPrototypeOf(v) === Object.prototype
    ) {
      // Guard against a self-referencing context: without ancestor
      // tracking the recursion would overflow the stack (RangeError),
      // which Slogger.log() swallows — dropping the whole record.
      if (seen.has(v)) {
        out.push([key, _value(CIRCULAR_PLACEHOLDER)]);
        continue;
      }
      seen.add(v);
      _flatten(v as Record<string, unknown>, key, out, seen);
      seen.delete(v);
    } else {
      out.push([key, _value(v instanceof Date ? v.toISOString() : v)]);
    }
  }
};

/**
 * Compile a logfmt formatter from {@link LogfmtOptions}.
 *
 * @example
 * ```typescript
 * import { logfmtFormatter, type SlogObject } from '@tundralibs/slogger';
 *
 * declare const slogObject: SlogObject;
 *
 * const fmt = logfmtFormatter();
 * fmt(slogObject);
 * // 'ts=2026-05-11T07:16:09.121Z level=info app=api host=web01 msg="user logged in" context.userId=42 context.ip=10.0.0.1'
 * ```
 */
export const logfmtFormatter = (
  options: LogfmtOptions = {},
): SloggerFormatter => {
  const order = options.envelopeOrder ??
    (['ts', 'level', 'app', 'host', 'msg', 'context'] as const);
  const numeric = options.useNumericLevel === true;
  const epoch = options.useEpochTimestamp === true;

  return (log: SlogObject): string => {
    const parts: string[] = [];
    for (const field of order) {
      switch (field) {
        case 'ts':
          parts.push(`ts=${epoch ? log.timestamp : log.isoDate}`);
          break;
        case 'level':
          parts.push(
            `level=${
              numeric ? log.level : _value(log.levelName.toLowerCase())
            }`,
          );
          break;
        case 'app':
          parts.push(`app=${_value(log.appName)}`);
          break;
        case 'host':
          parts.push(`host=${_value(log.hostname)}`);
          break;
        case 'id':
          parts.push(`id=${_value(log.id)}`);
          break;
        case 'msg':
          parts.push(`msg=${_value(log.message)}`);
          break;
        case 'context': {
          if (log.context && Object.keys(log.context).length > 0) {
            const flat: Array<[string, string]> = [];
            _flatten(log.context, '', flat, new WeakSet());
            // `_key` sanitises user-controlled context keys — a key with
            // a space / `=` / newline must be quoted or it splits the
            // line (logfmt injection).
            for (const [k, v] of flat) parts.push(`${_key(k)}=${v}`);
          }
          break;
        }
      }
    }
    return parts.join(' ');
  };
};

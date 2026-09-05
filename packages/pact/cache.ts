/**
 * @module
 *
 * Internal cache plumbing, mirroring norm's cache seam: the namespace
 * separator, the TTL ceiling, the runtime type list, and a JSON-safe
 * carrier for values cacher cannot round-trip — cacher persists via
 * `JSON.stringify`, which THROWS on a `bigint` (pact grants are bigint
 * masks) and silently degrades a `Date` to a string.
 */

import type { PactCacheType } from './types/mod.ts';

/** Namespace separator between the pact cache root and the data type.
 * Distinct from cacher's reserved `:` (which separates namespace from
 * key), so per-type namespaces are never colon-prefixes of one another
 * and `clear()` cannot cross namespaces. */
export const NS_SEP = '__';

/** Cacher's hard ceiling on `expiry` (30 days), in minutes. Above it
 * Memcached would treat the value as an absolute timestamp and store it
 * already-expired, so cacher rejects it — pact rejects the equivalent
 * per-type `ttl` minutes up front instead. */
export const MAX_TTL_MINUTES = 43200;

/** Runtime mirror of {@link PactCacheType} for validating dynamic
 * (untyped) configs — a typo'd type must throw, not silently create a
 * junk namespace. */
export const PACT_CACHE_TYPES: ReadonlySet<string> = new Set(
  ['apiKey', 'principal', 'session'] satisfies PactCacheType[],
);

const TAG = '$$pactEnc';

/**
 * Encode a value into a JSON-safe carrier, tagging the types a plain
 * `JSON.stringify` cannot round-trip: `bigint` (would throw) and `Date`
 * (would degrade to a bare string). Everything else passes through,
 * recursing into arrays and plain objects; non-plain objects (class
 * instances) are left for `JSON.stringify` to do its usual thing.
 *
 * A payload that itself carries the tag key is wrapped in a `'raw'`
 * escape carrier so {@link decodeFromCache} restores it verbatim instead
 * of reviving it as the wrong type.
 */
export function encodeForCache(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') {
    return { [TAG]: 'bigint', v: value.toString() };
  }
  if (value instanceof Date) return { [TAG]: 'date', v: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeForCache);
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const obj = value as Record<string, unknown>;
    if (typeof obj[TAG] === 'string') {
      return { [TAG]: 'raw', v: encodeFields(obj) };
    }
    return encodeFields(obj);
  }
  return value;
}

/** Field-wise encode of a plain object. `__proto__` keys are skipped:
 * `out[k] = v` would hit the prototype SETTER, not create an own key —
 * a silent local prototype swap instead of data. */
function encodeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__proto__') continue;
    out[k] = encodeForCache(v);
  }
  return out;
}

/** Revive a value encoded by {@link encodeForCache}. */
export function decodeFromCache(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodeFromCache);
  const obj = value as Record<string, unknown>;
  const tag = obj[TAG];
  if (typeof tag === 'string') {
    if (tag === 'bigint') return BigInt(obj.v as string);
    if (tag === 'date') return new Date(obj.v as string);
    // Escaped user object: decode its FIELDS, but do not re-interpret
    // the restored object (which carries the tag key) as a carrier.
    if (tag === 'raw') return decodeFields(obj.v as Record<string, unknown>);
  }
  return decodeFields(obj);
}

/** Field-wise decode of a plain object (mirror of {@link encodeFields},
 * including the `__proto__` skip — a cache-tamperer must not smuggle
 * values in via the prototype chain). */
function decodeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__proto__') continue;
    out[k] = decodeFromCache(v);
  }
  return out;
}

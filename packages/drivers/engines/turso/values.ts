/**
 * @fileoverview Pure Hrana `Value` ⇆ JS value mapping for the Turso / libSQL
 * engine — no wire, network, or native-driver imports.
 *
 * The `TursoHttpClient` transports {@link HranaValue}s verbatim; converting
 * them to (and from) JS values is the engine's job. This module holds that
 * mapping as two pure functions so it stays edge-safe (it reaches only the
 * `HranaValue` type and the standard `btoa`/`atob` globals) and is unit-testable
 * without a client or a server.
 *
 * ## SQLite type affinity
 * SQLite stores only NULL / INTEGER / REAL / TEXT / BLOB — there is no boolean,
 * date, or JSON type. The encoders below therefore fold JS `boolean`/`Date`/
 * plain-object values onto those five storage classes exactly as the native
 * {@link SQLiteEngine} does (`boolean` → `0`/`1`, `Date` → ISO-8601 text,
 * object → JSON text), so a value round-trips through the HTTP engine the same
 * way it would through the native SQLite driver.
 *
 * @module
 */

import type { HranaValue } from './types/mod.ts';

/**
 * The SQLite `INTEGER` safe range for a JS `number`: values within
 * ±(2^53 − 1) survive as an IEEE-754 double without loss; anything outside must
 * stay a `bigint`. Mirrors the native SQLite driver's int64 handling.
 */
const MAX_SAFE = 9007199254740991n; // Number.MAX_SAFE_INTEGER
const MIN_SAFE = -9007199254740991n; // Number.MIN_SAFE_INTEGER

/**
 * Decode a single Hrana wire {@link HranaValue} into a JS value.
 *
 * - `null` → `null`
 * - `integer` (an int64 carried as a decimal string) → a `number` when it fits
 *   in the IEEE-754 safe-integer range (±(2^53 − 1)), otherwise a `bigint` so
 *   64-bit precision survives — the same rule the native SQLite driver applies.
 * - `float` → `number`
 * - `text` → `string`
 * - `blob` → `Uint8Array` (base64-decoded)
 *
 * @param v - A raw result cell from a Hrana `StmtResult`.
 * @returns The decoded JS value.
 */
export function decodeHranaValue(v: HranaValue): unknown {
  switch (v.type) {
    case 'null':
      return null;
    case 'integer': {
      const big = BigInt(v.value);
      return big >= MIN_SAFE && big <= MAX_SAFE ? Number(big) : big;
    }
    case 'float':
      return v.value;
    case 'text':
      return v.value;
    case 'blob':
      return _base64ToBytes(v.base64);
  }
}

/**
 * Encode a single JS value into a Hrana wire {@link HranaValue}, following
 * SQLite's five storage classes (NULL / INTEGER / REAL / TEXT / BLOB):
 *
 * - `null` / `undefined` → `{ null }`
 * - `boolean` → `{ integer }` `'1'` / `'0'` (SQLite has no boolean type)
 * - `bigint` → `{ integer }` with the decimal string (full 64-bit precision)
 * - `number` → `{ integer }` (decimal string) when integer-valued — via
 *   `String(v)` when safe, or `BigInt(v).toString()` past the safe range so no
 *   exponential notation leaks onto the wire — else `{ float }`
 * - `string` → `{ text }`
 * - `Uint8Array` (incl. Node `Buffer`) → `{ blob }` (base64)
 * - `Date` → `{ text }` ISO-8601 — matching how {@link SQLiteEngine} encodes a
 *   `Date` param, so date parity holds across the native and HTTP engines
 * - any other object / array → `{ text }` `JSON.stringify` (for JSON columns)
 *
 * **Deliberately unsupported:** a non-integer, non-finite `number` (`NaN`,
 * `±Infinity`) is emitted as a `{ float }`; it JSON-serializes to `null` on the
 * wire (SQLite has no NaN/Infinity), so callers needing those must encode them
 * explicitly. `symbol` / `function` are not valid SQL params and fall to the
 * generic-object branch (`JSON.stringify` yields `undefined` → `{ text: '' }`);
 * do not pass them.
 *
 * @param v - The JS value bound to a `:name` placeholder.
 * @returns Its Hrana wire encoding.
 */
export function encodeHranaValue(v: unknown): HranaValue {
  if (v === null || v === undefined) return { type: 'null' };
  switch (typeof v) {
    case 'boolean':
      return { type: 'integer', value: v ? '1' : '0' };
    case 'bigint':
      return { type: 'integer', value: v.toString() };
    case 'number': {
      if (Number.isSafeInteger(v)) {
        return { type: 'integer', value: String(v) };
      }
      // Integer-valued but outside the safe range (every double ≥ 2^53 is an
      // integer): `String(v)` switches to exponential notation at |v| ≥ 1e21
      // (`String(1e21) === '1e+21'`), which is a malformed Hrana integer the
      // server / `BigInt()` reject. `BigInt(v).toString()` renders the exact
      // double as a plain decimal, no exponent.
      if (Number.isInteger(v)) {
        return { type: 'integer', value: BigInt(v).toString() };
      }
      // A genuine fraction (necessarily |v| < 2^53) → REAL.
      return { type: 'float', value: v };
    }
    case 'string':
      return { type: 'text', value: v };
  }
  if (v instanceof Uint8Array) {
    return { type: 'blob', base64: _bytesToBase64(v) };
  }
  if (v instanceof Date) {
    return { type: 'text', value: v.toISOString() };
  }
  // Plain object or array → JSON text (SQLite has no JSON storage class).
  return { type: 'text', value: JSON.stringify(v) ?? '' };
}

/** Decode a base64 string to bytes using the standard `atob` global. */
function _base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode bytes to a base64 string using the standard `btoa` global. */
function _bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Build the binary string byte-by-byte (a spread into `fromCharCode` would
  // overflow the call stack for large blobs).
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

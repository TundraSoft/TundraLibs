/**
 * @fileoverview Binary parameter encoding for Postgres.
 *
 * The wire protocol supports two formats per parameter (and per result
 * column): text (0) and binary (1). Text format is the path of least
 * resistance — convert to string, send. Binary trades simplicity for
 * speed: fewer bytes on wire, no server-side text→typed parsing.
 *
 * This module encodes JS values to binary for the common types and
 * declares their OIDs so the server can interpret them correctly. Result
 * decoding stays text-only for v1 — binary decode is a future addition.
 *
 * Type mapping:
 * - `boolean`           → bool (16)         binary, 1 byte
 * - integer `number`    → int4 (23)         binary, 4 bytes BE
 *   …outside int4 range → int8 (20)         binary, 8 bytes BE
 *   …outside int8 range → float8 (701)      binary, 8 bytes BE IEEE 754
 * - non-integer `number`→ float8 (701)      binary, 8 bytes BE IEEE 754
 * - `bigint`            → int8 (20)         binary, 8 bytes BE
 *   …outside int8 range → unspecified (0)   text, exact decimal (numeric coercion)
 * - `Date`              → timestamptz (1184) binary, 8 bytes BE microseconds
 * - `Uint8Array`        → bytea (17)        binary, raw bytes
 * - `string`            → unspecified (0)   text, UTF-8 (server infers type)
 * - `object` / array    → jsonb (3802)      binary, version byte + UTF-8
 * - `null` / `undefined`→ unspecified, length=-1
 *
 * @module
 */

import { EngineError } from '../../errors/mod.ts';

const enc = new TextEncoder();

/** Postgres type OIDs we encode for. Values match `pg_type.oid`. */
export const OID = {
  BOOL: 16,
  BYTEA: 17,
  INT8: 20,
  INT4: 23,
  TEXT: 25,
  FLOAT8: 701,
  TIMESTAMPTZ: 1184,
  JSONB: 3802,
} as const;

/** One encoded parameter ready for placement in a Bind message. */
export type EncodedParam = {
  /** Postgres type OID. `0` means "let the server infer". */
  oid: number;
  /** Wire format: 0 = text, 1 = binary. */
  format: 0 | 1;
  /** Body bytes. `null` for SQL NULL (length=-1 on the wire). */
  bytes: Uint8Array | null;
};

const PG_EPOCH_MS = Date.UTC(2000, 0, 1);
const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;
// Compared as BigInt: the int8 bounds sit past 2^53, so a `number`
// comparison against them rounds and would let `setBigInt64` see an
// out-of-range value (it throws) or wrap silently.
const INT8_MIN = -9_223_372_036_854_775_808n;
const INT8_MAX = 9_223_372_036_854_775_807n;

/**
 * Encode a JS value as a Postgres parameter — binary where it pays off,
 * text otherwise.
 *
 * The OID is sent in the Parse message and the format code in the Bind
 * message; the server matches them up and interprets the body.
 */
export function encodeParam(value: unknown): EncodedParam {
  if (value === null || value === undefined) {
    return { oid: 0, format: 0, bytes: null };
  }
  if (typeof value === 'boolean') {
    return {
      oid: OID.BOOL,
      format: 1,
      bytes: new Uint8Array([value ? 1 : 0]),
    };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= INT4_MIN && value <= INT4_MAX) {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setInt32(0, value, false);
        return { oid: OID.INT4, format: 1, bytes: buf };
      }
      // Past int4 but still a whole number: int8 keeps it an *integer* type.
      // Declaring float8 here (as this used to) mistypes the parameter — the
      // server then compares a bigint/numeric column against a double, which
      // changes operator selection and index usability, and silently rounds
      // anything the double can't represent.
      const asBigInt = BigInt(value);
      if (asBigInt >= INT8_MIN && asBigInt <= INT8_MAX) {
        const buf = new Uint8Array(8);
        new DataView(buf.buffer).setBigInt64(0, asBigInt, false);
        return { oid: OID.INT8, format: 1, bytes: buf };
      }
      // Larger than any Postgres integer type — fall through to float8,
      // which is the only lossless-as-it-gets option left for the value the
      // `number` actually holds.
    }
    // Non-integer (including NaN / ±Infinity, which `Number.isInteger`
    // rejects before the BigInt conversion could throw on them).
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setFloat64(0, value, false);
    return { oid: OID.FLOAT8, format: 1, bytes: buf };
  }
  if (typeof value === 'bigint') {
    // `setBigInt64` throws for values outside signed 64-bit — but it does NOT
    // for values Postgres still can't store as int8 that happen to fit the
    // two's-complement window; the danger is *silent wrap*. `9223372036854775808n`
    // (2^63) is one past INT8_MAX, `10n**30n` and `2n**64n` are far past it: all
    // three used to be handed to `setBigInt64` unchecked and wrote a wrapped,
    // wrong int8 (2^63 → -2^63, 2^64 → 0). Mirror the `number` path — int8 only
    // in range, otherwise fall through to full-precision text.
    if (value >= INT8_MIN && value <= INT8_MAX) {
      const buf = new Uint8Array(8);
      new DataView(buf.buffer).setBigInt64(0, value, false);
      return { oid: OID.INT8, format: 1, bytes: buf };
    }
    // Larger than any Postgres integer type: send the exact decimal as TEXT with
    // an UNSPECIFIED oid (0) so the server coerces it to `numeric` at full
    // precision (a float8 here would round). Same untyped-text tactic strings use.
    return { oid: 0, format: 0, bytes: enc.encode(value.toString()) };
  }
  if (value instanceof Date) {
    // An Invalid Date (`new Date('nope')`) has a NaN time; `BigInt(NaN)` below
    // throws a raw, contextless `RangeError`. Surface a typed engine error
    // instead so callers get the usual `EngineError` contract.
    if (Number.isNaN(value.getTime())) {
      throw new EngineError('OPERATION_FAILED', {
        instanceId: 'PostgresEngine::binary',
        operation: 'encode timestamptz parameter',
        reason: 'value is an Invalid Date',
      });
    }
    // timestamptz binary: signed i64 microseconds since 2000-01-01 UTC.
    const micros = BigInt(value.getTime() - PG_EPOCH_MS) * 1000n;
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigInt64(0, micros, false);
    return { oid: OID.TIMESTAMPTZ, format: 1, bytes: buf };
  }
  if (value instanceof Uint8Array) {
    return { oid: OID.BYTEA, format: 1, bytes: value };
  }
  if (typeof value === 'string') {
    // UNSPECIFIED oid (0), not TEXT: the server infers the type from
    // context, so `uuid_col = $1` / `json_col = $1` coerce the way a
    // bare SQL literal would. Declaring TEXT here made every
    // comparison against uuid/inet/enum columns fail with
    // "operator does not exist: uuid = text" (node-postgres binds
    // strings untyped for the same reason).
    return { oid: 0, format: 0, bytes: enc.encode(value) };
  }
  if (typeof value === 'object') {
    // jsonb binary: 1-byte version (currently `1`) + UTF-8 JSON.
    const json = JSON.stringify(value);
    const body = enc.encode(json);
    const out = new Uint8Array(1 + body.length);
    out[0] = 1;
    out.set(body, 1);
    return { oid: OID.JSONB, format: 1, bytes: out };
  }
  // Fallback — toString and let the server figure it out.
  return { oid: 0, format: 0, bytes: enc.encode(String(value)) };
}

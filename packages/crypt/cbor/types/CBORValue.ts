/**
 * @fileoverview Decoded CBOR value type for `@tundralibs/crypt/cbor`.
 *
 * @module
 */

/**
 * A decoded CBOR data item. Maps decode to a `Map` (not a plain object) so
 * that non-string keys — COSE keys use negative-integer labels — are
 * preserved. Integers that exceed `Number.MAX_SAFE_INTEGER` decode to
 * `bigint`; everything else within the safe range is a `number`.
 */
export type CBORValue =
  | number
  | bigint
  | string
  | boolean
  | null
  | undefined
  | Uint8Array
  | CBORValue[]
  | Map<CBORValue, CBORValue>;

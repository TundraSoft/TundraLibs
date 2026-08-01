/**
 * @fileoverview Hrana `Value` — the wire encoding of a single SQL value.
 *
 * @module
 */

/**
 * A single SQL value in the Hrana wire protocol.
 *
 * Every variant is tagged by a `type` discriminant. Two variants carry their
 * payload as a **string** rather than a native JSON number:
 *
 * - `integer` — a 64-bit signed integer whose `value` is a decimal string, so
 *   values outside the IEEE-754 safe-integer range survive JSON without loss
 *   of precision.
 * - `blob` — binary data as a base64 string under `base64` (not `value`).
 *
 * This client treats these as opaque transport encodings: it never converts a
 * `HranaValue` to (or from) a JS value — that mapping is the engine's job. Bind
 * values handed to {@link TursoHttpClient.execute} are already encoded as
 * `HranaValue`, and result cells are returned as `HranaValue` untouched.
 *
 * Confirmed against the Hrana v3 spec's `Value` type:
 * https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 */
export type HranaValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; base64: string };

/**
 * NIST curves supported for ECDSA signing and verification.
 *
 * These are exactly the curves the Web Crypto API implements, and exactly the
 * three RFC 7518 §3.4 binds to the `ES*` JOSE algorithms:
 *
 * | Curve   | JOSE algorithm | Hash    | Signature (R‖S) |
 * | ------- | -------------- | ------- | --------------- |
 * | `P-256` | `ES256`        | SHA-256 | 64 bytes        |
 * | `P-384` | `ES384`        | SHA-384 | 96 bytes        |
 * | `P-521` | `ES512`        | SHA-512 | 132 bytes       |
 *
 * Note the deliberate mismatch on the last row: **`ES512` uses P-521**, not a
 * (nonexistent) "P-512". The algorithm is named for its hash, the curve for its
 * field size, and 521 is not a typo — the curve's prime is 2^521 − 1, which is
 * why its signatures are 132 bytes rather than the 128 a "P-512" would give.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc7518#section-3.4} RFC 7518 §3.4
 */
export type ECCurve = 'P-256' | 'P-384' | 'P-521';

/**
 * @fileoverview ECDSA signature re-encoding — ASN.1/DER to raw `R‖S`.
 *
 * {@link signEC} emits, and {@link verifyEC} accepts, only the fixed-width
 * `R‖S` concatenation RFC 7515 §3.4 mandates for JOSE. Most non-web tooling —
 * OpenSSL's `dgst -sign`, and every WebAuthn/FIDO2 authenticator's `ES256`
 * assertion — instead emits the ASN.1 `SEQUENCE { INTEGER r, INTEGER s }` that
 * `verifyEC` deliberately refuses. {@link ecdsaDerToRaw} is the converter that
 * bridges that boundary, so a DER signature can be verified without hand-rolling
 * ASN.1 at the call site.
 *
 * @module
 * @see {@link https://www.rfc-editor.org/rfc/rfc7515#section-3.4} RFC 7515 §3.4 — `R‖S` encoding
 * @see {@link https://www.rfc-editor.org/rfc/rfc3279#section-2.2.3} RFC 3279 §2.2.3 — `Ecdsa-Sig-Value`
 */

import { readTlv } from './asn1.ts';
import { EC_SIGNATURE_BYTES } from './keys.ts';
import type { ECCurve } from './types/mod.ts';
import { encodeBase64 } from '@std/encoding';

/** ASN.1 universal tag for `SEQUENCE`. */
const TAG_SEQUENCE = 0x30;
/** ASN.1 universal tag for `INTEGER`. */
const TAG_INTEGER = 0x02;

/**
 * Turns one DER `INTEGER`'s content into the curve's fixed-width big-endian
 * field element.
 *
 * A DER `INTEGER` is minimal-length and signed, so an `r` or `s` whose top bit
 * is set carries a leading `0x00` to stay positive, and a small value carries
 * no leading zeros at all. Both are normalised here: leading zero octets are
 * dropped, then the value is left-padded with zeros to `fieldBytes` — the width
 * `R‖S` fixes for the curve.
 *
 * @param der - Buffer holding the signature DER.
 * @param start - Offset of the integer's first content octet.
 * @param end - Offset one past its last content octet.
 * @param fieldBytes - Field width for the curve (32 for P-256, 48 for P-384,
 *   66 for P-521).
 * @returns The `fieldBytes`-wide big-endian value.
 * @throws {Error} When the integer has no content, or holds more significant
 *   octets than the curve's field can (a signature from a larger curve).
 */
const integerToField = (
  der: Uint8Array,
  start: number,
  end: number,
  fieldBytes: number,
): Uint8Array => {
  // Drop leading zero octets. `< end - 1` keeps the final octet, so a genuine
  // zero value collapses to a single `0x00` rather than to nothing.
  let from = start;
  while (from < end - 1 && der[from] === 0x00) {
    from += 1;
  }
  const width = end - from;
  if (width === 0) {
    throw new Error('Malformed ECDSA signature: an integer has no content');
  }
  if (width > fieldBytes) {
    throw new Error(
      `Malformed ECDSA signature: an integer is ${width} octets, wider than ` +
        `the ${fieldBytes}-octet field of this curve`,
    );
  }
  const field = new Uint8Array(fieldBytes);
  field.set(der.subarray(from, end), fieldBytes - width);
  return field;
};

/**
 * Converts an ASN.1/DER ECDSA signature into the raw `R‖S` form the signing
 * primitives use.
 *
 * The input is the `Ecdsa-Sig-Value` of RFC 3279 §2.2.3 —
 * `SEQUENCE { INTEGER r, INTEGER s }` — as emitted by OpenSSL and by every
 * WebAuthn/FIDO2 authenticator for an `ES256` (or `ES384`/`ES512`) assertion.
 * The output is base64 of the fixed-width `R‖S` concatenation of RFC 7515 §3.4
 * — 64 octets for P-256, 96 for P-384, 132 for P-521 — the exact form
 * {@link signEC} emits and {@link verifyEC} accepts, so the result drops
 * straight into a verification call.
 *
 * The conversion is a pure re-encoding: it moves bytes between two
 * representations of the same `(r, s)` pair and performs **no** cryptography. A
 * signature that converts cleanly is not thereby valid — {@link verifyEC}
 * against the signer's public key remains the check that matters.
 *
 * @param {Uint8Array} der - The DER `Ecdsa-Sig-Value` bytes.
 * @param {ECCurve} curve - The curve the signature is for, which fixes the
 *   `R‖S` width. WebAuthn `ES256` assertions are always `'P-256'`.
 * @returns {string} Base64 of the raw `R‖S` signature.
 *
 * @throws {Error} When the DER is not a two-integer `SEQUENCE` spanning the
 *   whole input, or when either integer is wider than the curve's field (for
 *   example a P-384 signature passed as `'P-256'`).
 *
 * @example
 * ```ts
 * import { ecdsaDerToRaw, verifyEC } from '@tundralibs/crypt/sign';
 *
 * // `signature` is a WebAuthn ES256 assertion (DER); `signedData` is
 * // authenticatorData ‖ SHA-256(clientDataJSON); `publicKey` is the stored
 * // credential's EC public key.
 * declare const signature: Uint8Array;
 * declare const signedData: Uint8Array;
 * declare const publicKey: JsonWebKey;
 *
 * const rawSignature = ecdsaDerToRaw(signature, 'P-256');
 * const ok = await verifyEC(signedData, rawSignature, publicKey);
 * ```
 *
 * @see {@link verifyEC} for the verification this feeds
 * @see {@link https://www.rfc-editor.org/rfc/rfc7515#section-3.4} RFC 7515 §3.4 — `R‖S` encoding
 */
export const ecdsaDerToRaw = (der: Uint8Array, curve: ECCurve): string => {
  const fieldBytes = EC_SIGNATURE_BYTES[curve] / 2;

  const sequence = readTlv(der, 0);
  if (sequence.tag !== TAG_SEQUENCE) {
    throw new Error('Malformed ECDSA signature: not a DER SEQUENCE');
  }
  if (sequence.end !== der.length) {
    throw new Error(
      'Malformed ECDSA signature: trailing bytes after the SEQUENCE',
    );
  }

  const r = readTlv(der, sequence.contentStart);
  if (r.tag !== TAG_INTEGER) {
    throw new Error("Malformed ECDSA signature: 'r' is not a DER INTEGER");
  }
  const s = readTlv(der, r.end);
  if (s.tag !== TAG_INTEGER) {
    throw new Error("Malformed ECDSA signature: 's' is not a DER INTEGER");
  }
  if (s.end !== sequence.end) {
    throw new Error(
      'Malformed ECDSA signature: the SEQUENCE holds more than two integers',
    );
  }

  const raw = new Uint8Array(fieldBytes * 2);
  raw.set(integerToField(der, r.contentStart, r.end, fieldBytes), 0);
  raw.set(integerToField(der, s.contentStart, s.end, fieldBytes), fieldBytes);
  return encodeBase64(raw);
};

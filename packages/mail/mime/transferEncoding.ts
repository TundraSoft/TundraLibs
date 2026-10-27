/**
 * @fileoverview Content-Transfer-Encoding decoders (RFC 2045 §6).
 *
 * Both decoders are tolerant: stray characters outside the base64
 * alphabet are skipped, a `=` not followed by two hex digits is kept as
 * is. Real mail breaks both encodings often enough that throwing would
 * lose the message.
 *
 * @module
 */

const BASE64_LOOKUP = new Int8Array(256).fill(-1);
for (let i = 0; i < 64; i++) {
  BASE64_LOOKUP[
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      .charCodeAt(i)
  ] = i;
}
// URL-safe alphabet, seen in the wild inside Content-ID'd inline parts.
BASE64_LOOKUP['-'.charCodeAt(0)] = 62;
BASE64_LOOKUP['_'.charCodeAt(0)] = 63;

/**
 * Decode base64 from raw bytes, ignoring whitespace, line breaks and any
 * other byte outside the alphabet. A trailing partial group is decoded
 * as far as it goes.
 */
export function decodeBase64(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.floor(input.length * 3 / 4) + 3);
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < input.length; i++) {
    const v = BASE64_LOOKUP[input[i]!]!;
    if (v < 0) {
      if (input[i] === 0x3d) break; // '=' padding ends the data
      continue;
    }
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

const HEX = (c: number): number =>
  c >= 0x30 && c <= 0x39
    ? c - 0x30
    : c >= 0x41 && c <= 0x46
    ? c - 0x37
    : c >= 0x61 && c <= 0x66
    ? c - 0x57
    : -1;

/**
 * Decode quoted-printable. `=XX` becomes the byte, `=` at end of line is
 * a soft break, whitespace before a line break is dropped (RFC 2045
 * §6.7 rule 3). With `qEncoding` (RFC 2047 `Q`), `_` becomes a space and
 * soft breaks do not apply.
 */
export function decodeQuotedPrintable(
  input: Uint8Array,
  qEncoding = false,
): Uint8Array {
  const out = new Uint8Array(input.length);
  let n = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === 0x3d) { // '='
      const h = i + 1 < input.length ? HEX(input[i + 1]!) : -1;
      const l = i + 2 < input.length ? HEX(input[i + 2]!) : -1;
      if (h >= 0 && l >= 0) {
        out[n++] = (h << 4) | l;
        i += 2;
        continue;
      }
      if (!qEncoding) {
        // Soft line break: '=' then CRLF or LF.
        if (input[i + 1] === 0x0d && input[i + 2] === 0x0a) {
          i += 2;
          continue;
        }
        if (input[i + 1] === 0x0a) {
          i += 1;
          continue;
        }
      }
      out[n++] = c;
      continue;
    }
    if (qEncoding && c === 0x5f) { // '_'
      out[n++] = 0x20;
      continue;
    }
    if (!qEncoding && (c === 0x0d || c === 0x0a)) {
      // Drop trailing whitespace the encoder was obliged to protect.
      while (n > 0 && (out[n - 1] === 0x20 || out[n - 1] === 0x09)) n--;
    }
    out[n++] = c;
  }
  return out.subarray(0, n);
}

/**
 * Apply a `Content-Transfer-Encoding` to a part body. `7bit`, `8bit`,
 * `binary` and anything unrecognised return the bytes unchanged.
 */
export function decodeTransfer(
  body: Uint8Array,
  encoding: string,
): Uint8Array {
  switch (encoding) {
    case 'base64':
      return decodeBase64(body);
    case 'quoted-printable':
      return decodeQuotedPrintable(body);
    default:
      return body;
  }
}

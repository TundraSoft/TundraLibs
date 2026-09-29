/**
 * @fileoverview MD5 (RFC 1321) for Postgres's `AuthenticationMD5Password`
 * response only. Web Crypto's `digest` does not offer MD5, hence this small
 * pure implementation. MD5 is broken for collision resistance; do not use it
 * for anything new.
 *
 * @module
 */

/** Per-round shift amounts. */
const S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
];

/** `floor(abs(sin(i + 1)) * 2^32)`, precomputed. */
const K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
);

/** The MD5 digest of `data` as 32 lowercase hex characters. */
export function md5Hex(data: Uint8Array): string {
  // Pad: 0x80, zeros to 56 mod 64, then the bit length (little-endian u64).
  const bitLength = data.length * 8;
  const padded = new Uint8Array(((data.length + 8) >> 6) * 64 + 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(offset + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const t = (a + f + K[i]! + m[g]!) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((t << S[i]!) | (t >>> (32 - S[i]!)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += out.getUint8(i).toString(16).padStart(2, '0');
  }
  return hex;
}

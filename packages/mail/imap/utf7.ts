/**
 * @fileoverview Modified UTF-7 mailbox names (RFC 3501 §5.1.3).
 *
 * @module
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+,';
const B64_VALUE = new Map([...B64].map((c, i) => [c, i]));

/** Base64 (`,` for `/`, no padding) of the UTF-16BE encoding of `text`. */
function encodeRun(text: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const u = text.charCodeAt(i);
    bytes.push(u >> 8, u & 0xff);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) |
      (bytes[i + 2] ?? 0);
    out += B64[n >> 18]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64[n & 63]!;
  }
  return out;
}

function decodeRun(run: string): string {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const c of run) {
    const v = B64_VALUE.get(c);
    if (v === undefined) return '&' + run + '-'; // not ours: leave as written
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
  }
  return out;
}

/** Encode a mailbox name for the wire. ASCII names pass through unchanged. */
export function encodeUtf7(name: string): string {
  let out = '';
  let run = '';
  for (const ch of name) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) {
      if (run) {
        out += '&' + encodeRun(run) + '-';
        run = '';
      }
      out += ch === '&' ? '&-' : ch;
    } else {
      run += ch;
    }
  }
  if (run) out += '&' + encodeRun(run) + '-';
  return out;
}

/** Decode a mailbox name from the wire. */
export function decodeUtf7(name: string): string {
  if (!name.includes('&')) return name;
  return name.replace(
    /&([A-Za-z0-9+,]*)-/g,
    (_, run: string) => run === '' ? '&' : decodeRun(run),
  );
}

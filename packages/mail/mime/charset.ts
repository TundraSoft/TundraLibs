/**
 * @fileoverview Byte-to-string decoding with a tolerant fallback chain.
 *
 * @module
 */

const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });
const UTF8_LOOSE = new TextDecoder('utf-8');

/** Map every byte to the code point of the same value (ISO-8859-1). */
export function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
}

/** The inverse of {@link decodeLatin1}: code points below 256 to bytes. */
export function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Decode `bytes` as `charset`. An unknown or unsupported label, or no
 * label at all, falls back to strict UTF-8 and then to Latin-1, so the
 * result is always a string and never throws.
 */
export function decodeText(bytes: Uint8Array, charset?: string): string {
  if (charset) {
    const label = charset.trim().toLowerCase();
    if (label === 'utf-8' || label === 'utf8') return UTF8_LOOSE.decode(bytes);
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown to this runtime: fall through to the sniffing chain.
    }
  }
  try {
    return UTF8_STRICT.decode(bytes);
  } catch {
    return decodeLatin1(bytes);
  }
}

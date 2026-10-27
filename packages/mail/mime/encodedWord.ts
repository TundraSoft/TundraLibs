/**
 * @fileoverview RFC 2047 encoded-word decoding for header text.
 *
 * @module
 */

import { decodeText, encodeLatin1 } from './charset.ts';
import { decodeBase64, decodeQuotedPrintable } from './transferEncoding.ts';

const ENCODED_WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

/**
 * Replace every `=?charset?B|Q?text?=` in `text` with its decoded form.
 * Whitespace between two adjacent encoded words is dropped (RFC 2047
 * §6.2); a word with a charset this runtime cannot decode falls back the
 * way {@link decodeText} does. Malformed words are left as written.
 */
export function decodeEncodedWords(text: string): string {
  if (!text.includes('=?')) return text;
  let out = '';
  let last = 0;
  let prevEnd = -1;
  for (const m of text.matchAll(ENCODED_WORD)) {
    const start = m.index!;
    const between = text.slice(last, start);
    // Only whitespace since the previous encoded word: drop it.
    if (!(prevEnd === last && /^\s+$/.test(between))) out += between;
    const [, charsetSpec, enc, payload] = m;
    const charset = charsetSpec!.split('*')[0]!;
    const raw = encodeLatin1(payload!);
    const bytes = enc!.toUpperCase() === 'B'
      ? decodeBase64(raw)
      : decodeQuotedPrintable(raw, true);
    out += decodeText(bytes, charset);
    last = prevEnd = start + m[0].length;
  }
  return out + text.slice(last);
}

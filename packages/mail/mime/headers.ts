/**
 * @fileoverview Header block parsing: unfolding, RFC 2047 decoding,
 * parameterised values with RFC 2231 continuations, message-id lists.
 *
 * @module
 */

import type { MailContentType, MailHeader } from '../types/mod.ts';
import { decodeLatin1, decodeText } from './charset.ts';
import { decodeEncodedWords } from './encodedWord.ts';

const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });

/**
 * Split a raw header block into fields, unfolding continuation lines.
 * Values are left as written apart from trimming; a line with no colon
 * that is not a continuation is dropped.
 */
export function parseRawHeaders(bytes: Uint8Array): MailHeader[] {
  let text: string;
  try {
    text = UTF8_STRICT.decode(bytes);
  } catch {
    text = decodeLatin1(bytes);
  }
  const out: MailHeader[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    if ((line[0] === ' ' || line[0] === '\t') && out.length > 0) {
      out[out.length - 1]!.value += ' ' + line.trim();
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    out.push({
      name: line.slice(0, colon).trim(),
      value: line.slice(colon + 1).trim(),
    });
  }
  return out;
}

/**
 * The value of the first header named `name` (case-insensitive), or
 * `undefined`.
 */
export function getHeader(
  headers: MailHeader[],
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value;
}

/** Every value of the headers named `name` (case-insensitive), in order. */
export function getHeaders(headers: MailHeader[], name: string): string[] {
  const lower = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === lower).map((h) =>
    h.value
  );
}

/** Remove RFC 5322 comments (`(…)`, nested) outside quoted strings. */
export function stripComments(text: string): string {
  let out = '';
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      if (depth === 0) out += c + text[i + 1];
      i++;
      continue;
    }
    if (c === '"' && depth === 0) quoted = !quoted;
    if (!quoted) {
      if (c === '(') {
        depth++;
        continue;
      }
      if (c === ')' && depth > 0) {
        depth--;
        continue;
      }
    }
    if (depth === 0) out += c;
  }
  return out;
}

/** Split `text` on `sep` outside quoted strings and comments. */
export function splitUnquoted(text: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      cur += c + text[i + 1];
      i++;
      continue;
    }
    if (c === '"' && depth === 0) quoted = !quoted;
    else if (!quoted && c === '(') depth++;
    else if (!quoted && c === ')' && depth > 0) depth--;
    if (c === sep && !quoted && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts;
}

/** Strip one layer of surrounding quotes and unescape `\x` pairs. */
export function unquote(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return t;
}

/** RFC 2231 `charset'lang'percent-encoded` value. */
function decodeExtendedValue(raw: string, charset: string | undefined): string {
  const bytes = new Uint8Array(raw.length);
  let n = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === '%' && /^[0-9a-f]{2}$/i.test(raw.slice(i + 1, i + 3))) {
      bytes[n++] = parseInt(raw.slice(i + 1, i + 3), 16);
      i += 2;
    } else {
      bytes[n++] = c.charCodeAt(0) & 0xff;
    }
  }
  return decodeText(bytes.subarray(0, n), charset);
}

/**
 * Parse `value; name=val; name*=…` into the leading value and its
 * parameters. Handles quoted values, RFC 2231 continuations
 * (`name*0=`, `name*1=`) and charset-tagged values (`name*=utf-8''…`),
 * and the non-standard but common RFC 2047 encoded word inside a quoted
 * value. Keys are lowercased.
 */
export function parseParameterized(
  header: string,
): { value: string; params: Record<string, string> } {
  const segments = splitUnquoted(stripComments(header), ';');
  const value = segments[0]!.trim().toLowerCase();
  // name -> { pieces by index, charset, encoded? }
  const pending = new Map<
    string,
    { pieces: Map<number, string>; charset?: string; extended: Set<number> }
  >();
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    let key = seg.slice(0, eq).trim().toLowerCase();
    let raw = seg.slice(eq + 1).trim();
    let index = 0;
    let extended = false;
    if (key.endsWith('*')) {
      extended = true;
      key = key.slice(0, -1);
    }
    const star = key.lastIndexOf('*');
    if (star > 0 && /^\d+$/.test(key.slice(star + 1))) {
      index = Number(key.slice(star + 1));
      key = key.slice(0, star);
    }
    let entry = pending.get(key);
    if (!entry) {
      entry = { pieces: new Map(), extended: new Set() };
      pending.set(key, entry);
    }
    if (extended) {
      if (index === 0) {
        const q1 = raw.indexOf("'");
        const q2 = q1 >= 0 ? raw.indexOf("'", q1 + 1) : -1;
        if (q2 >= 0) {
          entry.charset = raw.slice(0, q1) || undefined;
          raw = raw.slice(q2 + 1);
        }
      }
      entry.extended.add(index);
    } else {
      raw = unquote(raw);
    }
    entry.pieces.set(index, raw);
  }
  const params: Record<string, string> = {};
  for (const [key, entry] of pending) {
    const indexes = [...entry.pieces.keys()].sort((a, b) => a - b);
    let joined = '';
    for (const i of indexes) {
      const piece = entry.pieces.get(i)!;
      joined += entry.extended.has(i)
        ? decodeExtendedValue(piece, entry.charset)
        : piece;
    }
    params[key] = decodeEncodedWords(joined);
  }
  return { value, params };
}

/** Parse a `Content-Type` header; defaults to `text/plain` when absent or malformed. */
export function parseContentType(header: string | undefined): MailContentType {
  if (!header) return { type: 'text', subtype: 'plain', params: {} };
  const { value, params } = parseParameterized(header);
  const slash = value.indexOf('/');
  if (slash <= 0) return { type: 'text', subtype: 'plain', params };
  return {
    type: value.slice(0, slash).trim(),
    subtype: value.slice(slash + 1).trim(),
    params,
  };
}

/**
 * Extract message ids from `Message-ID`, `In-Reply-To` or `References`.
 * Angle-bracketed ids are taken in order; text with no brackets is split
 * on whitespace so a bare id still comes through.
 */
export function parseMessageIds(text: string | undefined): string[] {
  if (!text) return [];
  const cleaned = stripComments(text);
  const bracketed = [...cleaned.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]!);
  if (bracketed.length > 0) return bracketed;
  return cleaned.split(/\s+/).filter((s) => s.length > 0);
}

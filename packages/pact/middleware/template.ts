/**
 * @fileoverview The HMAC signing template: frozen RFC 9421 component
 * names inside `${…}`, literal text between them as separators. A
 * template is compiled once at boot (unknown key, missing mandatory key,
 * a response-only key in a request template, or two keys with nothing
 * between them = config error) and rendered per message.
 *
 * @module
 */
import { encodeBase64 } from '@std/encoding';
import { PactError } from '../errors/mod.ts';
import type { SignatureTemplate } from './types/mod.ts';

/** Request template used when `hmac.template` is not given. */
export const REQUEST_TEMPLATE =
  '${@method}\n${@path}${@query}\n${x-timestamp}\n${content-digest}';
/** Response template used when `hmac.response` is not given. */
export const RESPONSE_TEMPLATE =
  '${@status}\n${x-timestamp}\n${content-digest}';

const REQUEST_KEYS = new Set([
  '@method',
  '@path',
  '@query',
  '@request-target',
  '@authority',
  '@scheme',
  '@target-uri',
  'x-timestamp',
  'x-nonce',
  'x-key-id',
  'content-digest',
]);
const RESPONSE_KEYS = new Set([
  '@status',
  '@method',
  '@path',
  '@query',
  'x-timestamp',
  'x-nonce',
  'x-key-id',
  'content-digest',
]);
const MANDATORY = {
  request: ['@method', '@path', 'x-timestamp', 'content-digest'],
  response: ['@status', 'x-timestamp', 'content-digest'],
} as const;
/**
 * Key pairs that may sit side by side with no separator: the second
 * value is empty or starts with a character the first can never contain
 * (`?` for a query, `/` for a path), so the boundary stays unambiguous.
 */
const ADJACENT_OK = new Set([
  '@path|@query',
  '@authority|@path',
  '@authority|@request-target',
]);
const KEY_CHARS = /^[a-z0-9@-]+$/;
const ENCODER = new TextEncoder();

/**
 * Compile a template for one direction.
 *
 * @throws {PactError} INVALID_OPTION on an unknown key, a key not
 *   lowercase, a mandatory key missing, two keys with no separator
 *   between them, or an empty template.
 */
export function compileTemplate(
  source: string,
  kind: 'request' | 'response',
): SignatureTemplate {
  const option = kind === 'request' ? 'hmac.template' : 'hmac.response';
  const fail = (reason: string): never => {
    throw new PactError('INVALID_OPTION', { option, reason });
  };
  const known = kind === 'request' ? REQUEST_KEYS : RESPONSE_KEYS;
  const parts: (string | { key: string })[] = [];
  const keys: string[] = [];
  let cursor = 0;
  // A linear scan: `${` opens a key, the next `}` closes it. No
  // backtracking, so a hostile template cannot make compilation slow.
  for (;;) {
    const open = source.indexOf('${', cursor);
    if (open === -1) break;
    const close = source.indexOf('}', open + 2);
    if (close === -1) fail(`unterminated '\${' at offset ${open}`);
    const key = source.slice(open + 2, close);
    if (key === '' || key !== key.toLowerCase()) {
      fail(`template key '\${${key}}' must be a lowercase component name`);
    }
    if (!KEY_CHARS.test(key)) fail(`invalid template key '\${${key}}'`);
    // Request templates may name any other header; response templates
    // only the frozen set (the server knows no other client header).
    if (!known.has(key) && (kind === 'response' || key.startsWith('@'))) {
      fail(`unknown template key '\${${key}}'`);
    }
    const literal = source.slice(cursor, open);
    const previous = keys.at(-1);
    if (
      previous !== undefined && literal === '' &&
      !ADJACENT_OK.has(`${previous}|${key}`)
    ) {
      fail(
        `keys '\${${previous}}' and '\${${key}}' need a separator between them`,
      );
    }
    parts.push(literal, { key });
    keys.push(key);
    cursor = close + 1;
  }
  parts.push(source.slice(cursor));
  if (keys.length === 0) fail('template names no component');
  for (const required of MANDATORY[kind]) {
    if (!keys.includes(required)) {
      fail(`template must include '\${${required}}'`);
    }
  }
  return {
    kind,
    source,
    keys,
    render: (value) =>
      parts.map((p) => typeof p === 'string' ? p : value(p.key)).join(''),
  };
}

/** RFC 9530 `Content-Digest` value over the exact body bytes (sha-256). */
export async function contentDigest(
  body: Uint8Array | string | null,
): Promise<string> {
  const bytes = body === null
    ? new Uint8Array()
    : typeof body === 'string'
    ? ENCODER.encode(body)
    : body;
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return `sha-256=:${encodeBase64(hash)}:`;
}

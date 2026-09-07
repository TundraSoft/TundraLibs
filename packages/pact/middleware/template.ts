/**
 * @fileoverview The HMAC signing template: frozen RFC 9421 component
 * names inside `${…}`, literal text between them as separators. A
 * template is compiled once at boot (unknown key, missing mandatory key,
 * or a response-only key in a request template = config error) and
 * rendered per message.
 *
 * @module
 */
import { encodeBase64 } from '@std/encoding';
import { PactError } from '../errors/mod.ts';

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
const KEY_PATTERN = /\$\{([^}]*)\}/g;
const ENCODER = new TextEncoder();

/** A compiled template: the literal pieces and the keys between them. */
export type SignatureTemplate = {
  readonly kind: 'request' | 'response';
  readonly source: string;
  readonly keys: readonly string[];
  /** The frozen keys plus, for requests, any other lowercase header name. */
  render(value: (key: string) => string): string;
};

/**
 * Compile a template for one direction.
 *
 * @throws {PactError} INVALID_OPTION on an unknown key, a key not
 *   lowercase, a mandatory key missing, or an empty template.
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
  let last = 0;
  for (const match of source.matchAll(KEY_PATTERN)) {
    const key = match[1] ?? '';
    if (key !== key.toLowerCase() || key === '') {
      fail(`template key '\${${key}}' must be a lowercase component name`);
    }
    // Request templates may name any other header; response templates
    // only the frozen set (the server knows no other client header).
    if (!known.has(key) && (kind === 'response' || key.startsWith('@'))) {
      fail(`unknown template key '\${${key}}'`);
    }
    if (!/^[a-z0-9@-]+$/.test(key)) fail(`invalid template key '\${${key}}'`);
    parts.push(source.slice(last, match.index), { key });
    keys.push(key);
    last = match.index + match[0].length;
  }
  parts.push(source.slice(last));
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

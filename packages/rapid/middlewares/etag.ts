/**
 * @fileoverview `etag` — content-hash `ETag` + conditional GET. Hashes
 * the response body, stamps `ETag`, and answers `304 Not Modified` when
 * the client's `If-None-Match` already has that hash. HTTP GET/HEAD only,
 * `200` responses only.
 *
 * Order it OUTSIDE compression (`app.use(compress(), etag())`) so the tag
 * hashes the ORIGINAL body, not the compressed bytes.
 *
 * @module
 */

import type { RapidContextResponse, RapidMiddleware } from '../types/mod.ts';
import { isStreamBody } from '../utils/streams.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

const encoder = new TextEncoder();

const bodyBytes = (content: RapidContextResponse['content']): Uint8Array => {
  if (content instanceof Uint8Array) return content;
  if (typeof content === 'string') return encoder.encode(content);
  return encoder.encode(JSON.stringify(content));
};

const computeTag = async (bytes: Uint8Array): Promise<string> => {
  // Content-keying only, but SHA-256 costs the same as SHA-1 here and
  // keeps scanners quiet about weak-hash use.
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource),
  );
  let hex = '';
  for (let i = 0; i < 10; i++) hex += digest[i]!.toString(16).padStart(2, '0');
  return `"${bytes.length.toString(16)}-${hex}"`;
};

/** Whether `If-None-Match` covers `tag` (handles `*`, lists, and W/). */
const ifNoneMatches = (header: string, tag: string): boolean => {
  if (header.trim() === '*') return true;
  const bare = tag.replace(/^W\//, '');
  return header.split(',').some((t) => t.trim().replace(/^W\//, '') === bare);
};

/**
 * Add strong `ETag` + `304` conditional handling. Idempotent responses
 * only (GET/HEAD, `200`); leaves everything else untouched.
 */
export function etag(): RapidMiddleware {
  const middleware: RapidMiddleware = async (ctx, next) => {
    await next();
    if (ctx.type !== 'HTTP') return;
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return;

    const res = ctx.response;
    if (res === null) return;
    if (res.status !== undefined && res.status !== 200) return;
    // Don't hash an already-encoded body (compression ran first) — the
    // tag would then vary by transfer encoding.
    if (ctx.responseHeaders.has('content-encoding')) return;
    // A STREAM body cannot be content-hashed without buffering it, which
    // would defeat streaming — skip. (File streams from serveStatic carry a
    // cheap stat-based weak ETag already.)
    if (isStreamBody(res.content)) return;

    const tag = await computeTag(bodyBytes(res.content));
    ctx.setHeader('etag', tag);

    const inm = ctx.headers.get('if-none-match');
    if (inm !== null && ifNoneMatches(inm, tag)) {
      // 304 keeps the ETag header (already set) and drops the body.
      ctx.response = { status: 304, content: '' };
    }
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}

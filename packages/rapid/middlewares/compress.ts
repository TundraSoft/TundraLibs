/**
 * @fileoverview `compress` — gzip/deflate the response body when the
 * client accepts it and the body is worth compressing. HTTP only. Uses
 * the Web-standard `CompressionStream` (gzip/deflate; no brotli). Order
 * it OUTSIDE `etag()` (`app.use(compress(), etag())`) so the tag hashes
 * the original body.
 *
 * @module
 */

import type { HTTPContext } from '../context/mod.ts';
import type { RapidContextState, RapidMiddleware } from '../types/mod.ts';

/** Options for {@link compress}. */
export type CompressOptions = {
  /**
   * Minimum body size (bytes) worth compressing — below this the
   * overhead isn't worth it.
   * @default 1024
   */
  threshold?: number;
};

const encoder = new TextEncoder();
const NO_BODY = new Set([204, 205, 304]);

/** Pick gzip (preferred) or deflate from `Accept-Encoding`, else null. */
const pickEncoding = (accept: string): 'gzip' | 'deflate' | null => {
  const a = accept.toLowerCase();
  if (/\bgzip\b(?!\s*;\s*q=0)/.test(a)) return 'gzip';
  if (/\bdeflate\b(?!\s*;\s*q=0)/.test(a)) return 'deflate';
  return null;
};

/** Text-ish content is worth compressing; binary/already-compressed isn't. */
const isCompressible = (contentType: string): boolean =>
  /^text\//i.test(contentType) ||
  /(json|xml|javascript|ecmascript|svg|wasm|\+text|manifest)/i.test(
    contentType,
  );

/** Serialize the current response body to bytes + its content-type. */
const bodyOf = (
  ctx: HTTPContext<RapidContextState>,
): { bytes: Uint8Array; contentType: string } => {
  const content = ctx.response!.content;
  const explicit = ctx.responseHeaders.get('content-type');
  if (content instanceof Uint8Array) {
    return {
      bytes: content,
      contentType: explicit ?? 'application/octet-stream',
    };
  }
  if (typeof content === 'string') {
    return {
      bytes: encoder.encode(content),
      contentType: explicit ?? 'text/plain; charset=utf-8',
    };
  }
  return {
    bytes: encoder.encode(JSON.stringify(content)),
    contentType: explicit ?? 'application/json',
  };
};

const compressBytes = async (
  bytes: Uint8Array,
  format: 'gzip' | 'deflate',
): Promise<Uint8Array> => {
  const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(
    new CompressionStream(format),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/**
 * Compress the response body when the client accepts gzip/deflate, the
 * body is over `threshold` bytes, is a compressible type, and isn't
 * already encoded. Sets `Content-Encoding` + `Vary: Accept-Encoding`.
 */
export function compress(options: CompressOptions = {}): RapidMiddleware {
  const threshold = options.threshold ?? 1024;

  return async (ctx, next) => {
    await next();
    if (ctx.type !== 'HTTP' || ctx.method === 'HEAD') return;
    if (ctx.response === null) return;
    if (ctx.responseHeaders.has('content-encoding')) return; // already encoded
    if (NO_BODY.has(ctx.status)) return;

    const encoding = pickEncoding(ctx.headers.get('accept-encoding') ?? '');
    if (encoding === null) return;

    const { bytes, contentType } = bodyOf(ctx);
    if (bytes.length < threshold || !isCompressible(contentType)) return;

    ctx.response = {
      content: await compressBytes(bytes, encoding),
      // content-type must be re-stated (we're handing bytes now, which
      // would otherwise default to octet-stream at serialize time).
      headers: {
        'content-type': contentType,
        'content-encoding': encoding,
        'vary': 'Accept-Encoding',
      },
    };
  };
}

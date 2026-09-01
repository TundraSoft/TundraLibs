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
import { isStreamBody, toReadableStream } from '../utils/streams.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

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

/**
 * Why no brotli: the Web-standard `CompressionStream` — the only encoder
 * available on every supported runtime — rejects `'br'` on Deno, Bun AND
 * Node (verified: all three throw TypeError). Brotli would need `node:zlib`
 * (Node/Bun only — a runtime-divergent result, which this package forbids)
 * or a pure-JS encoder dependency. gzip is universally negotiated and within
 * a few percent of brotli for API payloads, so it is deliberately omitted.
 */

/** Pick gzip (preferred) or deflate from `Accept-Encoding`, else null. The
 * `q=0` exclusion matches ONLY a true zero (`q=0`, `q=0.0`), not a high
 * priority like `q=0.9` — `(?![.\d])` stops `q=0` matching the `0` prefix. */
const pickEncoding = (accept: string): 'gzip' | 'deflate' | null => {
  const a = accept.toLowerCase();
  if (/\bgzip\b(?!\s*;\s*q=0(?:\.0+)?(?![.\d]))/.test(a)) return 'gzip';
  if (/\bdeflate\b(?!\s*;\s*q=0(?:\.0+)?(?![.\d]))/.test(a)) return 'deflate';
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
 * body is at least `threshold` bytes, is a compressible type, and isn't
 * already encoded. Sets `Content-Encoding` and merges `Accept-Encoding`
 * into `Vary`.
 */
export function compress(options: CompressOptions = {}): RapidMiddleware {
  const threshold = options.threshold ?? 1024;

  const middleware: RapidMiddleware = async (ctx, next) => {
    await next();
    if (ctx.type !== 'HTTP' || ctx.method === 'HEAD') return;
    if (ctx.response === null) return;
    if (ctx.responseHeaders.has('content-encoding')) return; // already encoded
    if (NO_BODY.has(ctx.status)) return;
    if (ctx.status === 206 || ctx.responseHeaders.has('content-range')) {
      // A partial response's Content-Range describes IDENTITY byte
      // positions — compressing the slice would hand resume/seek clients
      // gzip bytes under identity offsets, reassembling garbage.
      return;
    }

    const encoding = pickEncoding(ctx.headers.get('accept-encoding') ?? '');
    if (encoding === null) return;

    // MERGE into any existing Vary rather than replacing it — the response
    // setter overwrites per-key, so a bare `Vary: Accept-Encoding` would
    // drop `cors()`'s `Vary: Origin` and make a shared cache serve one
    // origin's response to another.
    const priorVary = ctx.responseHeaders.get('vary');
    const vary = priorVary === null
      ? 'Accept-Encoding'
      : /\baccept-encoding\b/i.test(priorVary)
      ? priorVary
      : `${priorVary}, Accept-Encoding`;

    // A STREAM body is compressed chunk-wise through CompressionStream —
    // never buffered, so the threshold can't apply (length unknown) and any
    // content-length is dropped (the encoded size is unknowable).
    const streamBody = ctx.response.content;
    if (isStreamBody(streamBody)) {
      const contentType = ctx.responseHeaders.get('content-type') ??
        'application/octet-stream';
      if (!isCompressible(contentType)) return;
      ctx.response = {
        content: toReadableStream(streamBody).pipeThrough(
          // CompressionStream's writable is typed BufferSource; a byte stream is one.
          new CompressionStream(encoding) as unknown as ReadableWritablePair<
            Uint8Array,
            Uint8Array
          >,
        ),
        headers: {
          'content-type': contentType,
          'content-encoding': encoding,
          'vary': vary,
        },
      };
      // The encoded size is unknowable — drop any content-length the handler
      // set (chunked transfer). Must go through deleteHeader: responseHeaders
      // is a defensive COPY, so deleting on it would silently do nothing.
      ctx.deleteHeader('content-length');
      return;
    }

    const { bytes, contentType } = bodyOf(ctx);
    if (bytes.length < threshold || !isCompressible(contentType)) return;

    const compressed = await compressBytes(bytes, encoding);
    ctx.response = {
      content: compressed,
      // content-type must be re-stated (we're handing bytes now, which
      // would otherwise default to octet-stream at serialize time).
      headers: {
        'content-type': contentType,
        'content-encoding': encoding,
        'vary': vary,
        // The body IS these bytes now — restate the length so a
        // content-length the handler set for the UNCOMPRESSED body can't
        // survive the per-key header merge and truncate/hang the client
        // (the stream path drops it instead; here we know the exact size).
        'content-length': String(compressed.length),
      },
    };
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}

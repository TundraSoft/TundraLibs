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
import { RapidError } from '../errors/mod.ts';
import type { RapidContextState, RapidMiddleware } from '../types/mod.ts';
import { pickEncoding } from '../utils/pickEncoding.ts';
import { meterAction } from '../utils/Meter.ts';
import { isStreamBody, toReadableStream } from '../utils/streams.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** Options for {@link compress}. */
export type CompressOptions = {
  /**
   * Minimum body size (bytes) worth compressing — below this the
   * overhead isn't worth it. A non-negative integer.
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

/** Text-ish content is worth compressing; binary/already-compressed isn't. */
const isCompressible = (contentType: string): boolean =>
  /^text\//i.test(contentType) ||
  /(json|xml|javascript|ecmascript|svg|wasm|\+text|manifest)/i.test(
    contentType,
  );

/** Serialize the current response body to bytes + its content-type. */
/** The content type the body WILL be serialised with — no serialisation here. */
const contentTypeOf = (ctx: HTTPContext<RapidContextState>): string => {
  const explicit = ctx.responseHeaders.get('content-type');
  if (explicit !== null) return explicit;
  const content = ctx.response!.content;
  if (content instanceof Uint8Array) return 'application/octet-stream';
  if (typeof content === 'string') return 'text/plain; charset=utf-8';
  return 'application/json';
};

/** The body's bytes — called ONCE, after every gate that could skip compression. */
const bytesOf = (ctx: HTTPContext<RapidContextState>): Uint8Array => {
  const content = ctx.response!.content;
  if (content instanceof Uint8Array) return content;
  if (typeof content === 'string') return encoder.encode(content);
  return encoder.encode(JSON.stringify(content));
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
 * already encoded. Sets `Content-Encoding`, and merges `Accept-Encoding`
 * into `Vary` on every compressible response — encoded or not — so a
 * shared cache never keys one client's identity copy for everyone. A
 * HEAD carries the same headers its GET would (RFC 9110 §9.3.2).
 *
 * @throws {RapidError} RAPID_CONFIG at build when `threshold` is not a
 *   non-negative integer.
 */
export function compress(options: CompressOptions = {}): RapidMiddleware {
  const threshold = options.threshold ?? 1024;
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'compress threshold must be a non-negative integer of bytes',
      details: { threshold },
    });
  }

  const middleware: RapidMiddleware = async (ctx, next) => {
    await next();
    if (ctx.type !== 'HTTP') return;
    if (ctx.response === null) return;
    if (ctx.responseHeaders.has('content-encoding')) return; // already encoded
    if (NO_BODY.has(ctx.status)) return;
    if (ctx.status === 206 || ctx.responseHeaders.has('content-range')) {
      // A partial response's Content-Range describes IDENTITY byte
      // positions — compressing the slice would hand resume/seek clients
      // gzip bytes under identity offsets, reassembling garbage.
      return;
    }

    // RFC 9110 §8.8.3: a STRONG validator must change when the
    // representation does — and Content-Encoding is part of it. An inner
    // etag() hashed the identity body; weaken its tag (nginx does the
    // same) so no cache splices gzip and identity bytes under one tag.
    const weaken = (): void => {
      const tag = ctx.responseHeaders.get('etag');
      if (tag !== null && !tag.startsWith('W/')) {
        ctx.setHeader('etag', `W/${tag}`);
      }
    };

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

    const streamBody = ctx.response.content;
    const streamed = isStreamBody(streamBody);
    const contentType = streamed
      ? ctx.responseHeaders.get('content-type') ?? 'application/octet-stream'
      : contentTypeOf(ctx);
    if (!isCompressible(contentType)) return;
    // The representation varies by Accept-Encoding from here on, whether
    // or not THIS client gets the encoded form.
    ctx.setHeader('vary', vary);
    const encoding = pickEncoding(ctx.headers.get('accept-encoding') ?? '');
    if (encoding === null) return;

    // A STREAM body is compressed chunk-wise through CompressionStream —
    // never buffered, so the threshold can't apply (length unknown) and any
    // content-length is dropped (the encoded size is unknowable).
    if (streamed) {
      ctx.meter?.middleware('compress', encoding, meterAction(ctx));
      weaken();
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
        },
      };
      // The encoded size is unknowable — drop any content-length the handler
      // set (chunked transfer). Must go through deleteHeader: responseHeaders
      // is a defensive COPY, so deleting on it would silently do nothing.
      ctx.deleteHeader('content-length');
      return;
    }

    const bytes = bytesOf(ctx);
    if (bytes.length < threshold) return;
    // Recorded HERE — a reply under the threshold is a decision NOT to
    // compress, and the family documents decisions the middleware took.
    ctx.meter?.middleware('compress', encoding, meterAction(ctx));

    const compressed = await compressBytes(bytes, encoding);
    weaken();
    ctx.response = {
      content: compressed,
      // content-type must be re-stated (we're handing bytes now, which
      // would otherwise default to octet-stream at serialize time).
      headers: {
        'content-type': contentType,
        'content-encoding': encoding,
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

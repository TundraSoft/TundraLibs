/**
 * @fileoverview `serializeResponse` — turn interpreted response content
 * into a Fetch `Response`, decoupled from the HTTP context. The request
 * half is `parseBody`; this is its outbound mirror.
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';
import { RapidError } from '../errors/mod.ts';
import type { RapidContextResponse } from '../types/mod.ts';
import { isStreamBody, toReadableStream } from './streams.ts';

/**
 * Statuses the Fetch standard defines as NULL-BODY: constructing a
 * `Response` with a body and one of these THROWS.
 */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205]);

/**
 * 1xx informational statuses `new Response()` cannot represent
 * CONSISTENTLY: 103 throws on every runtime (Deno/Bun/Node all reject
 * it), and 101 throws on Node specifically while succeeding on Deno/Bun
 * — left to the native constructor, the SAME handler would 500 on one
 * runtime and succeed on another, violating this package's golden rule
 * ("every package runs identically on Deno, Bun, and Node"). Rejected
 * explicitly, before either runtime's constructor is even called, so
 * the outcome (a disclosure-mode 500 via `__finalize`'s catch) is
 * identical everywhere. Not a `serializeResponse`-specific limitation:
 * the Fetch `Response` type cannot express 1xx at all.
 */
const UNREPRESENTABLE_STATUSES: ReadonlySet<number> = new Set([101, 103]);

/**
 * Serialise `content` into a `Response` with `status` and `headers`.
 *
 * - `null` content → an empty body (`204 No Content` when the status is
 *   the default 200, else the given status with no body).
 * - `string` → `text/plain`, `Uint8Array` → `application/octet-stream`,
 *   any object → JSON (serialised exactly once here). A content type
 *   already on `headers` is never overwritten.
 * - NULL-BODY statuses (204, 205, and 304) carry no body and no
 *   content-type: the content is DROPPED rather than throwing, since
 *   the status is what the caller explicitly asked for.
 * - a STREAM body (`ReadableStream` / async iterable) is handed to the
 *   `Response` as-is — streamed, never buffered, so no `content-length` is
 *   set (chunked transfer) and the content-type defaults to
 *   `application/octet-stream`. On a HEAD the stream is cancelled, unread.
 *
 * `headers` is mutated in place (content-type defaulting) — pass the
 * live outbound headers.
 *
 * `head` (a HEAD request): the body is computed exactly as for GET — so
 * the `content-type` and a correct `content-length` are set — then dropped,
 * yielding a bodiless response with GET's headers, per HTTP semantics.
 *
 * @throws {RapidError} RAPID_RESPONSE_INVALID for status 101 or 103 —
 *   see {@link UNREPRESENTABLE_STATUSES}.
 */
export function serializeResponse(
  content: RapidContextResponse['content'] | null,
  status: StatusCode,
  headers: Headers,
  head = false,
): Response {
  if (UNREPRESENTABLE_STATUSES.has(status)) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message:
        `status ${status} cannot be represented by a Response on every runtime (Node rejects 101, every runtime rejects 103) — 1xx informational responses are not supported`,
      details: { status },
    });
  }
  if (content === null) {
    const emptyStatus = status === 200 ? 204 : status;
    return new Response(null, { status: emptyStatus, headers });
  }

  if (isStreamBody(content)) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/octet-stream');
    }
    const stream = toReadableStream(content);
    if (NULL_BODY_STATUSES.has(status) || status === 304 || head) {
      // Bodiless: release the source (a generator's `finally` runs) and
      // send headers only. A stream has no knowable length, so HEAD carries
      // no content-length — chunked semantics, same as the GET would.
      void stream.cancel();
      if (!head) headers.delete('content-type');
      return new Response(null, { status, headers });
    }
    return new Response(stream, { status, headers });
  }

  let body: BodyInit;
  if (typeof content === 'string') {
    body = content;
    if (!headers.has('content-type')) {
      headers.set('content-type', 'text/plain; charset=utf-8');
    }
  } else if (content instanceof Uint8Array) {
    body = content as unknown as BodyInit;
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/octet-stream');
    }
  } else {
    body = JSON.stringify(content);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  if (NULL_BODY_STATUSES.has(status) || status === 304) {
    headers.delete('content-type');
    return new Response(null, { status, headers });
  }
  if (head) {
    // Same headers a GET would send — content-type (above) + the exact
    // content-length — but no body. `body` is already the serialized form.
    const length = typeof body === 'string'
      ? new TextEncoder().encode(body).byteLength
      : (body as Uint8Array).byteLength;
    headers.set('content-length', String(length));
    return new Response(null, { status, headers });
  }
  return new Response(body, { status, headers });
}

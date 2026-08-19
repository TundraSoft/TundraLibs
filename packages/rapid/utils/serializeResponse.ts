/**
 * @fileoverview `serializeResponse` — turn interpreted response content
 * into a Fetch `Response`, decoupled from the HTTP context. The request
 * half is `parseBody`; this is its outbound mirror.
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';

/**
 * Statuses the Fetch standard defines as NULL-BODY: constructing a
 * `Response` with a body and one of these THROWS. Handling only
 * 204/304 left 205 (and the 1xx informational pair) to explode inside
 * `respond()` and surface as a 500 — see the fileoverview note.
 */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 103, 204, 205]);

/**
 * Serialise `content` into a `Response` with `status` and `headers`.
 *
 * - `null` content → an empty body (`204 No Content` when the status is
 *   the default 200, else the given status with no body).
 * - `string` → `text/plain`, `Uint8Array` → `application/octet-stream`,
 *   any object → JSON (serialised exactly once here). A content type
 *   already on `headers` is never overwritten.
 * - NULL-BODY statuses (101, 103, 204, 205 and 304) carry no body and
 *   no content-type: the content is DROPPED rather than throwing, since
 *   the status is what the caller explicitly asked for.
 *
 * `headers` is mutated in place (content-type defaulting) — pass the
 * live outbound headers.
 */
export function serializeResponse(
  content: string | Record<string, unknown> | Uint8Array | null,
  status: StatusCode,
  headers: Headers,
): Response {
  if (content === null) {
    const emptyStatus = status === 200 ? 204 : status;
    return new Response(null, { status: emptyStatus, headers });
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
  return new Response(body, { status, headers });
}

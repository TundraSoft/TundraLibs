/**
 * @fileoverview {@link RapidContextResponse} — the transport-agnostic
 * response payload set on (and read from) `ctx.response`.
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';
import type { CookieOptions } from '../../utils/cookies.ts';

/**
 * The response payload — CLOSED over the known transport keys (no index
 * signature: a typo'd key is a compile error, not a silent no-op).
 *
 * `content` is universal. `status`/`headers` are optional extras each
 * context INTERPRETS in its `response` setter override — HTTP consumes
 * both, JOB and SOCKET read `status` as the outcome and skip `headers`.
 * A future transport-specific key widens the
 * override's parameter type (`RapidContextResponse & { frameMeta?: … }`)
 * so it is visible exactly to transport-bound middleware.
 */
export type RapidContextResponse = {
  /**
   * The response content; plain objects are serialized at respond(). A
   * `ReadableStream` (or an async iterable of chunks, wrapped into one) is
   * STREAMED to the client as-is — no buffering, so large files / SSE / proxy
   * passthrough never hold the body in memory. Stream bodies are opaque to
   * body-inspecting middleware (`etag` skips them; `compress` pipes them
   * chunk-wise) and are HTTP-only (a JOB/SOCKET reply rejects one).
   */
  content:
    | string
    | Record<string, unknown>
    | Uint8Array
    | ReadableStream<Uint8Array>
    | AsyncIterable<Uint8Array | string>;
  /** HTTP status / JOB outcome / SOCKET ok-error. */
  status?: StatusCode;
  /** Consumed by HTTP (merged per-key); ignored elsewhere. */
  headers?: Record<string, string> | Headers;
  /**
   * Cookies to set, with proper encoding (and HMAC signing via the app
   * `secret` when `options.signed`). HTTP-ONLY: consumed by the HTTP context
   * and SILENTLY IGNORED on JOB/SOCKET (a job has no cookies), so a method
   * decorated for several transports may return one harmlessly. Prefer this
   * over a raw `Set-Cookie` header.
   */
  cookies?: ReadonlyArray<{
    name: string;
    value: string;
    options?: CookieOptions;
  }>;
  /**
   * Redirect the client: a URL string → `302 Found`; `{ url, permanent }` →
   * `301 Moved Permanently` when `permanent`. Sets `location` and takes
   * precedence over `status` (the body is sent empty). HTTP-ONLY: SILENTLY
   * IGNORED on JOB/SOCKET — it never becomes a 3xx there (which those
   * transports reject), so a shared method may return one harmlessly.
   */
  redirect?: string | { url: string; permanent?: boolean };
};

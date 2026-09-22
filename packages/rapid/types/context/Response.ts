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
    | readonly unknown[]
    | Uint8Array
    | ReadableStream<Uint8Array>
    | AsyncIterable<Uint8Array | string>;
  /**
   * Result-set metadata that belongs BESIDE the content, never inside
   * it — so a collection can be the bare array it is, rather than an
   * envelope wrapping rows and a count.
   *
   * Each transport gives it a home: HTTP sets the three configured
   * paging headers (`server.paging`), a templated route exposes it to
   * the template as `view.paging`, and a SOCKET reply carries it on the
   * frame. Supply only what the handler knows — `page` and `size`
   * default to the RESOLVED request window (`ctx.args.paging`, already
   * defaulted and clamped), and an explicit value wins.
   *
   * `total` is never inferred: it is the one figure only the handler
   * can know, and it costs a second count query, so it is absent
   * unless counted. JOB ignores the key, like `cookies` and `redirect`,
   * so a multi-transport method needs no branching.
   */
  paging?: {
    /** 1-based page number. Defaults to the request's resolved page. */
    page?: number;
    /** Page size. Defaults to the request's resolved size. */
    size?: number;
    /** Total matching rows across all pages. Omitted when not counted. */
    total?: number;
  };
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
   * transports reject), so a shared method may return one harmlessly. On
   * a TEMPLATED route the representer owns it: a real 3xx on a ui
   * navigation, the redirect header on a swap, and DROPPED on the api
   * surface, where the reply is its `content` (an API client would follow
   * the 3xx and receive the target page, not the result) — one sign-in
   * route serves the no-JS form, the swap and the API client.
   */
  redirect?: string | { url: string; permanent?: boolean };
};

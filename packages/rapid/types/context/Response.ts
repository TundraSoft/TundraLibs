/**
 * @fileoverview {@link RapidContextResponse} — the transport-agnostic
 * response payload set on (and read from) `ctx.response`.
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';

/**
 * The response payload — CLOSED over the known transport keys (no index
 * signature: a typo'd key is a compile error, not a silent no-op).
 *
 * `content` is universal. `status`/`headers` are optional extras each
 * context INTERPRETS in its `response` setter override — HTTP consumes
 * both, JOB reads `status` as the outcome, SOCKET/CLI take `content`
 * and skip the rest. A future transport-specific key widens the
 * override's parameter type (`RapidContextResponse & { frameMeta?: … }`)
 * so it is visible exactly to transport-bound middleware.
 */
export type RapidContextResponse = {
  /** The response content; plain objects are serialized at respond(). */
  content: string | Record<string, unknown> | Uint8Array;
  /** HTTP status / JOB outcome / CLI exit mapping / SOCKET ok-error. */
  status?: StatusCode;
  /** Consumed by HTTP (merged per-key); ignored elsewhere. */
  headers?: Record<string, string> | Headers;
};

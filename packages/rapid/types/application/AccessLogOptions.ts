/**
 * @fileoverview {@link RapidAccessLogOptions} — the access line the core
 * writes for every invocation (HTTP request, socket frame, job firing)
 * through the application's slogger.
 *
 * @module
 */

/**
 * `logger.access` — one line per invocation, level by outcome: `error`
 * for 5xx, `warn` for 4xx, `info` otherwise (an unmatched 404 is `info`
 * — scanner noise is not a warning), `warn` + `slow: true` past `slow`.
 * The message reads on a bare console — `GET /users 200 12ms`,
 * `JOB posts.digest 200 41ms` — and the structured fields ride the
 * context for logfmt/JSON handlers: `type`, `action`, `status`, `ms`,
 * `code` (when the chain threw), `matched`/`surface` on HTTP, `drift` on
 * jobs; `requestId` rides the ambient context. Handler levels, sampling
 * and masking stay slogger's job.
 */
export type RapidAccessLogOptions = {
  /**
   * Write the line at all. Off when an app ships its own access logging.
   * @default true
   */
  enabled?: boolean;
  /**
   * Routed HTTP paths never logged — exact (`/healthz`) or a prefix
   * (`/assets/*`). Sockets and jobs are never skipped this way.
   * @default []
   */
  skip?: readonly string[];
  /**
   * Duration in SECONDS past which the line is a `warn` carrying
   * `slow: true` (fractions allowed). Unset → never.
   */
  slow?: number;
  /**
   * Add the client's `remoteAddress`, `userAgent` and `referer` to HTTP
   * lines — personal data, so off unless you have a reason.
   * @default false
   */
  client?: boolean;
};

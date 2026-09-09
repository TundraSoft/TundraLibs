/**
 * @fileoverview {@link RapidApplicationMetricsOptions} — which metric
 * families the app's meter records (`server.metrics`).
 *
 * @module
 */

/**
 * Per-family switches for `server.metrics`. `server.metrics: true` turns
 * every family on; the object form turns individual families off. A
 * family that is off declares no series at all (it never appears in a
 * scrape) and its recorders are a single boolean check, so trimming
 * families is about scrape size and label cardinality, not CPU. With
 * `server.metrics` off entirely no meter exists and nothing is checked.
 *
 * Every counter ends in `_total`; every duration is a histogram in
 * milliseconds. Labels are low-cardinality by construction: the route or
 * command PATTERN (never a raw path), an error CODE (never a message), a
 * job or channel NAME (never an id).
 */
export type RapidApplicationMetricsOptions = {
  /**
   * The invocation cycle: `rapid_requests_total{transport,action,status}`,
   * `rapid_request_duration_ms{transport,action}` (the same clock as the
   * `x-response-time` header and the access line),
   * `rapid_requests_in_flight{transport}`, `rapid_errors_total{transport,action}`
   * (5xx).
   * @default true
   */
  requests?: boolean;
  /**
   * Every disclosed error by registered code:
   * `rapid_error_codes_total{code,transport}` — rate limits hit, CSRF
   * rejections, validation failures, timeouts, idempotency conflicts,
   * each on its own series.
   * @default true
   */
  errors?: boolean;
  /**
   * Scheduled and triggered jobs: `rapid_job_runs_total{job,outcome}`
   * (`ok`, `failed`, `skipped` by middleware, `overlap` — a tick dropped
   * because the previous run was still going), `rapid_job_duration_ms{job}`,
   * `rapid_job_drift_ms{job}` (scheduled → fired).
   * @default true
   */
  jobs?: boolean;
  /**
   * The websocket listener: `rapid_socket_upgrades_total{result}`
   * (`accepted` / `refused` by origin policy),
   * `rapid_channel_subscriptions_total{channel,event}` (`subscribed`,
   * `unsubscribed`, `refused` by the channel's `authorize`),
   * `rapid_channel_publishes_total{channel}`.
   * @default true
   */
  sockets?: boolean;
  /**
   * Decisions the shipped middleware take:
   * `rapid_middleware_events_total{middleware,event,action}` — `rateLimit`
   * `rejected`; `idempotency` `replayed` / `in_flight` / `mismatch` /
   * `released`; `session` `loaded` / `missed` / `saved` / `touched` /
   * `regenerated` / `destroyed`; `csrf` `rejected`; `timeout` `fired`;
   * `compress` `gzip` / `deflate`.
   * @default true
   */
  middleware?: boolean;
  /**
   * Bytes and uploads: `rapid_request_bytes_total{transport}` (request
   * bodies actually read) and `rapid_uploads_total` (file parts written).
   * Response bytes are not measured — a string body would have to be
   * encoded twice to count it.
   * @default true
   */
  bodies?: boolean;
  /**
   * The UI surface: `rapid_representations_total{kind}` (`json`,
   * `fragment`, `page`, `redirect`) and `rapid_static_requests_total{event}`
   * (`hit`, `not_modified`, `range`, `unsatisfiable`, `miss`).
   * @default true
   */
  ui?: boolean;
};

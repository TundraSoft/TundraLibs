/**
 * @fileoverview Constructor options for {@link NeonHttpClient}.
 *
 * @module
 */

/**
 * Configuration for a {@link NeonHttpClient}.
 *
 * The client dials Neon's SQL-over-HTTP endpoint at `https://<host>/sql`, so
 * `host` is always required (it forms the request URL). Authentication is by
 * one of two Neon-supported mechanisms — supply at least one:
 *
 * - **Connection string** (primary/documented): either a ready-made
 *   `connectionString`, or the `username` / `password` / `database`
 *   components the client assembles into
 *   `postgresql://<user>:<pass>@<host>/<db>`. It is sent verbatim in the
 *   `Neon-Connection-String` request header — the password in it is what
 *   authenticates the request.
 * - **Bearer `token`** (Neon Authorize / RLS): a JWT sent as
 *   `Authorization: Bearer <token>`. May be combined with a connection string
 *   (Neon reads both), or used on its own.
 *
 * Only plain HTTPS over native `fetch` is used — no `tls` or `socketPath`
 * transport options are exposed, keeping the client edge/serverless-safe.
 */
export type NeonHttpClientOptions = {
  /**
   * Neon endpoint host, e.g. `ep-cool-name-a1b2c3.us-east-2.aws.neon.tech`.
   * The request URL is built as `https://<host>/sql` (unless {@link endpoint}
   * overrides the base URL). It is always required — even with `endpoint` set —
   * because it is the host component of the `Neon-Connection-String` header. A
   * placeholder host (e.g. `'localhost'`) is acceptable when `endpoint` points
   * at a gateway that ignores that header's host.
   */
  host: string;

  /**
   * Full base URL to POST `/sql` against — e.g. `http://localhost:1234` — used
   * **verbatim** as the RESTler `baseURL` in place of `https://<host>`. The
   * request path is still `/sql`.
   *
   * This exists for pointing the client at a **Neon-compatible gateway** or a
   * **local test proxy** rather than Neon's cloud endpoint; leave it unset for
   * real Neon. It carries no transport options of its own — plain HTTP(S) over
   * native `fetch` only, no `tls` / `socketPath` — so it stays edge-safe.
   */
  endpoint?: string;

  /**
   * Full Postgres connection string, e.g.
   * `postgresql://user:password@host/dbname`. Sent in the
   * `Neon-Connection-String` header. Takes precedence over the
   * `username`/`password`/`database` components when both are supplied.
   */
  connectionString?: string;

  /** Database role/username, used to build the connection string. */
  username?: string;

  /** Password for `username`, used to build the connection string. */
  password?: string;

  /** Database name, used to build the connection string. */
  database?: string;

  /**
   * Bearer JWT for Neon Authorize (row-level security). Sent as
   * `Authorization: Bearer <token>`.
   */
  token?: string;

  /**
   * Per-request timeout in seconds (1–120), passed through to RESTler.
   * @default 30
   */
  timeout?: number;
};

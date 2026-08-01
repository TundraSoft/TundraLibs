/**
 * @fileoverview Constructor options for {@link TursoHttpClient}.
 *
 * @module
 */

/**
 * Configuration for a {@link TursoHttpClient}.
 *
 * The client speaks the Hrana v3 protocol over HTTP to Turso / libSQL. Turso
 * hands out database URLs like `libsql://<db>-<org>.turso.io`; the HTTP
 * transport uses `https://<host>`. Accordingly `url` accepts:
 *
 * - a `libsql://…` URL — the `libsql:` scheme is mapped to `https:`;
 * - an `https://…` (or `http://…`, for a local `sqld` / test server) URL —
 *   used as-is;
 * - a bare host (e.g. `db-org.turso.io`) — assumed `https://`.
 *
 * Only the resulting origin (`scheme://host[:port]`) is used as the base URL;
 * the pipeline path is appended to it. Any path/query on `url` is ignored (so a
 * token accidentally embedded in the URL query never rides along). Only plain
 * HTTPS over native `fetch` is used — no `tls` / `socketPath` transport options
 * — keeping the client edge/serverless-safe.
 */
export type TursoHttpClientOptions = {
  /**
   * The database URL or host. A `libsql://…` URL is mapped to `https://…`; an
   * `http(s)://…` URL is used verbatim; a bare host is assumed `https://`.
   */
  url: string;

  /**
   * Turso auth token (a JWT), sent as `Authorization: Bearer <authToken>`.
   * An empty string sends no `Authorization` header, for a local `sqld` that
   * requires no auth.
   */
  authToken: string;

  /**
   * Per-request timeout in seconds (1–120), passed through to RESTler.
   * @default 30
   */
  timeout?: number;
};

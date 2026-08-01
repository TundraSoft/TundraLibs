/**
 * @fileoverview Constructor options for {@link D1HttpClient}.
 *
 * @module
 */

/**
 * Configuration for a {@link D1HttpClient}.
 *
 * The client speaks Cloudflare's D1 REST (SQLite-over-HTTP) query API. Every
 * request is addressed to a specific database
 * (`/accounts/{accountId}/d1/database/{databaseId}/query`) and authenticated
 * with a bearer API token, so all three of `accountId`, `databaseId`, and
 * `apiToken` are required.
 *
 * Only plain HTTPS over native `fetch` is used — no `tls` / `socketPath`
 * transport options are exposed — keeping the client edge/serverless-safe.
 */
export type D1HttpClientOptions = {
  /**
   * Cloudflare account ID that owns the D1 database. Forms the
   * `/accounts/{accountId}/…` segment of the request path.
   */
  accountId: string;

  /**
   * D1 database ID (the UUID Cloudflare assigns the database). Forms the
   * `/d1/database/{databaseId}/…` segment of the request path.
   */
  databaseId: string;

  /**
   * Cloudflare API token with D1 access, sent as
   * `Authorization: Bearer <apiToken>`.
   */
  apiToken: string;

  /**
   * Full base URL to POST the query path against — e.g.
   * `http://localhost:1234` — used **verbatim** as the RESTler `baseURL` in
   * place of Cloudflare's `https://api.cloudflare.com/client/v4`. The request
   * path is still `/accounts/{accountId}/d1/database/{databaseId}/query`.
   *
   * This exists for pointing the client at a **Cloudflare-compatible gateway**
   * or a **local test proxy** rather than Cloudflare's cloud endpoint; leave it
   * unset for real D1. It carries no transport options of its own — plain
   * HTTP(S) over native `fetch` only, no `tls` / `socketPath` — so it stays
   * edge-safe. Additive / non-breaking.
   */
  endpoint?: string;

  /**
   * Per-request timeout in seconds (1–120), passed through to RESTler.
   * @default 30
   */
  timeout?: number;
};

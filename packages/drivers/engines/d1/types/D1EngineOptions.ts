/**
 * @fileoverview Configuration options for `D1Engine`.
 *
 * @module
 */

import type { SQLEngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `D1Engine` — SQLite over Cloudflare D1's REST
 * (SQLite-over-HTTP) query API.
 *
 * Every request is addressed to a specific database
 * (`/accounts/{accountId}/d1/database/{databaseId}/query`) and authenticated
 * with a bearer API token, so all three of `accountId`, `databaseId`, and
 * `apiToken` are required (the constructor enforces them with
 * `MISSING_CONFIG_VALUE`).
 *
 * The pool-related fields on {@link SQLEngineOptions} (`pool`) are inert: this
 * engine is pool-free (one stateless HTTP client; every statement is its own
 * HTTP request, so nothing survives across calls to pool).
 *
 * @extends SQLEngineOptions
 */
export type D1EngineOptions = SQLEngineOptions & {
  /**
   * Cloudflare account ID that owns the D1 database. Forms the
   * `/accounts/{accountId}/…` segment of the request path. Required.
   */
  accountId: string;

  /**
   * D1 database ID (the UUID Cloudflare assigns the database). Forms the
   * `/d1/database/{databaseId}/…` segment of the request path. Required.
   */
  databaseId: string;

  /**
   * Cloudflare API token with D1 access, sent as
   * `Authorization: Bearer <apiToken>`. Required. It lives only on the HTTP
   * client (RESTler's closure-backed options store) and is never copied onto a
   * wrapped error.
   */
  apiToken: string;

  /**
   * Full base URL to POST the query path against — e.g. `http://localhost:1234`
   * — used **verbatim** as the HTTP base URL in place of Cloudflare's
   * `https://api.cloudflare.com/client/v4` (the path stays
   * `/accounts/{accountId}/d1/database/{databaseId}/query`). For pointing the
   * engine at a **Cloudflare-compatible gateway** or a **local test proxy**
   * rather than Cloudflare's cloud; leave unset for real D1. Non-breaking /
   * additive.
   */
  endpoint?: string;

  /**
   * Per-request timeout in seconds (1–120), passed through to the HTTP
   * transport (RESTler).
   * @default 30
   */
  timeout?: number;
};

/**
 * @fileoverview Configuration options for `NeonHttpEngine`.
 *
 * @module
 */

import type { SQLEngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `NeonHttpEngine` — Postgres over Neon's
 * SQL-over-HTTP endpoint.
 *
 * The engine dials `https://<host>/sql`, so `host` is always required (it forms
 * the request URL) — the constructor enforces it with `MISSING_CONFIG_VALUE`.
 * Authentication uses one of Neon's supported mechanisms; supply at least one:
 *
 * - **Connection string** (primary/documented): either a ready-made
 *   `connectionString`, or the `username` / `password` / `database` components
 *   (all three) which the transport assembles into
 *   `postgresql://<user>:<pass>@<host>/<db>`. Sent in the
 *   `Neon-Connection-String` header — the password in it authenticates.
 * - **Bearer `token`** (Neon Authorize / RLS): a JWT sent as
 *   `Authorization: Bearer <token>`. May accompany a connection string or be
 *   used on its own.
 *
 * The pool-related fields on {@link SQLEngineOptions} (`pool`) are inert: this
 * engine is pool-free (one stateless HTTP client, no socket pool).
 *
 * @extends SQLEngineOptions
 */
export type NeonHttpEngineOptions = SQLEngineOptions & {
  /**
   * Neon endpoint host, e.g. `ep-cool-name-a1b2c3.us-east-2.aws.neon.tech`.
   * Required — the request URL is built as `https://<host>/sql`. (Declared on
   * {@link SQLEngineOptions} as optional; the constructor enforces it.)
   */
  host?: string;

  /**
   * Full base URL to POST `/sql` against — e.g. `http://localhost:1234` — used
   * **verbatim** as the HTTP base URL in place of `https://<host>` (the path
   * stays `/sql`). For pointing the engine at a **Neon-compatible gateway** or
   * a **local test proxy** rather than Neon's cloud; leave unset for real Neon.
   * `host` is still required (it forms the `Neon-Connection-String` header) — a
   * placeholder host is fine when `endpoint` is set. Non-breaking / additive.
   */
  endpoint?: string;

  /**
   * Full Postgres connection string, e.g.
   * `postgresql://user:password@host/dbname`. Sent in the
   * `Neon-Connection-String` header. Takes precedence over the
   * `username`/`password`/`database` components when both are supplied.
   */
  connectionString?: string;

  /**
   * Bearer JWT for Neon Authorize (row-level security). Sent as
   * `Authorization: Bearer <token>`.
   */
  token?: string;

  /**
   * Per-request timeout in seconds (1–120), passed through to the HTTP
   * transport (RESTler).
   * @default 30
   */
  timeout?: number;
};

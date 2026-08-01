/**
 * @fileoverview Configuration options for `TursoEngine`.
 *
 * @module
 */

import type { SQLEngineOptions } from '../../../types/mod.ts';

/**
 * Configuration options for `TursoEngine` — SQLite over Turso / libSQL's
 * Hrana-v3 HTTP query API.
 *
 * The engine dials `<origin>/v3/pipeline`, deriving the origin from `url`.
 * `url` is always required (the constructor enforces it with
 * `MISSING_CONFIG_VALUE`) and accepts:
 *
 * - a `libsql://…` (or `libsqls://…`) URL — Turso hands these out; the
 *   `libsql:` scheme is mapped to `https:` for the HTTP transport;
 * - an `https://…` URL — used as-is (Turso cloud, or a TLS-fronted gateway);
 * - an `http://…` URL — used as-is, for a **local `sqld`** / test server that
 *   speaks Hrana over plain HTTP.
 *
 * The pool-related fields on {@link SQLEngineOptions} (`pool`) are inert: this
 * engine is pool-free (one stateless HTTP client; every statement is its own
 * HTTP request, so nothing survives across calls to pool).
 *
 * @extends SQLEngineOptions
 */
export type TursoEngineOptions = SQLEngineOptions & {
  /**
   * The database URL or host. A `libsql://…` URL is mapped to `https://…`; an
   * `http(s)://…` URL is used verbatim (`http://…` targets a local `sqld`).
   * Required — it forms the pipeline request URL. (Declared here rather than on
   * {@link SQLEngineOptions}; the constructor enforces it.)
   */
  url: string;

  /**
   * Turso auth token (a JWT), sent as `Authorization: Bearer <authToken>`.
   * Optional: omit it (or pass an empty string) for a local `sqld` that needs
   * no auth — no `Authorization` header is sent.
   */
  authToken?: string;

  /**
   * Per-request timeout in seconds (1–120), passed through to the HTTP
   * transport (RESTler).
   * @default 30
   */
  timeout?: number;
};

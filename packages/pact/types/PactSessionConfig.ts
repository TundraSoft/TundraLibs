/**
 * @fileoverview Session configuration for `@tundralibs/pact` — stateless
 * JWT by default; `'OPAQUE'` or `refresh` flips the session hooks to
 * required.
 *
 * @module
 */

/** The `session` option block. */
export type PactSessionConfig = {
  /** @default 'JWT' */
  strategy?: 'JWT' | 'OPAQUE';
  /** Access-token / session ttl, seconds. @default 3600 (900 with refresh) */
  ttl?: number;
  /**
   * Serialize grants into the JWT — zero-lookup `verify`, at the cost of
   * staleness: grants AND status changes are invisible until the (short)
   * token expiry. Without it, `verify` resolves the principal fresh via
   * `getUser`.
   */
  embedGrants?: boolean;
  /**
   * Refresh-token rotation (JWT strategy only; `OPAQUE` sessions have a
   * fixed lifetime). Requires the `getSession`/`saveSession`/
   * `deleteSession` hooks.
   */
  refresh?: {
    /** Family lifetime, seconds. @default 30 days */
    ttl?: number;
    /**
     * Seconds a just-rotated generation stays valid — absorbs legitimate
     * concurrent refreshes. `0` = strict. @default 5
     */
    grace?: number;
  };
};

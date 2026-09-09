/**
 * @fileoverview {@link RapidApplicationStaticEntry} — one mount of the
 * config-driven static file serving (`server.static`).
 *
 * @module
 */

/** One static mount's options (the value side of `server.static`). */
export type RapidApplicationStaticEntry = {
  /**
   * Directory to serve. A RELATIVE path resolves against the config
   * directory for a config-driven app (deployment-anchored — the file
   * that names it) and against the working directory otherwise.
   */
  root: string;
  /**
   * File served for a directory request (path ends in `/`). `false`
   * disables the index (a directory request falls through to 404).
   * @default 'index.html'
   */
  index?: string | false;
  /** When set, `Cache-Control: public, max-age=<seconds>` on served files. */
  maxAge?: number;
  /**
   * Serve fingerprinted requests — a URL carrying the `v` query param,
   * as `view.asset()` emits — with `Cache-Control: public,
   * max-age=31536000, immutable` (overriding `maxAge` for those
   * requests), and let `view.asset()` derive content hashes for files
   * under this mount (lazily, per referenced path — no boot walk).
   * @default false
   */
  fingerprint?: boolean;
};

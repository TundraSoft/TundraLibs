/**
 * @fileoverview {@link RapidApplicationStaticConfig} — the `server.static`
 * stanza: URL prefix → directory, fully file-able.
 *
 * @module
 */

import type { RapidApplicationStaticEntry } from './StaticEntry.ts';

/**
 * Static file serving, declared as data: each key is the URL prefix
 * (must start with `/`; `'/'` mounts at the root), each value the
 * directory to serve (string shorthand) or the full
 * {@link RapidApplicationStaticEntry}. The framework serves entries in
 * declaration order at a FIXED position — after every middleware, on
 * route miss, before the 404 — so routes always win a collision and
 * `secureHeaders`/`cors`/logging always apply. There is no middleware to
 * mount and no position to choose.
 */
export type RapidApplicationStaticConfig = Readonly<
  Record<string, string | RapidApplicationStaticEntry>
>;

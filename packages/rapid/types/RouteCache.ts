/**
 * @fileoverview {@link RapidRouteCache} — the `cache` route option: how
 * long a GET route's data reply is kept, and what beyond the route and
 * its path params tells one cached answer from another.
 *
 * @module
 */

import type { RapidBinder } from './Binder.ts';

/** A GET route's reply cache. */
export type RapidRouteCache = {
  /** How long a stored reply serves, in seconds (> 0). */
  seconds: number;
  /**
   * Binders whose values EXTEND the key — `query()`, `paging()`,
   * `header(name)`, `cookie(name)`, `auth()`, `config(path)`. The default
   * key (route · surface · every path param) is never replaced. A route
   * whose binders read a channel the key does not carry fails the boot;
   * a plain handler that does so at run time is served uncached (a
   * warning; a throw in DEVELOPMENT).
   */
  key?: readonly RapidBinder[];
};

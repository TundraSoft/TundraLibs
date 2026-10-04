/**
 * @fileoverview {@link RapidCacheStore} — what `app.cache({ … })` binds:
 * the three operations rapid needs from a cache backend. rapid builds
 * every key and never sees the backend; `@tundralibs/cacher` is the
 * intended implementation, `memoryStore()` the in-process one.
 *
 * @module
 */

/** A cache backend, bound once per application. */
export type RapidCacheStore = {
  /** The value stored under `key`, or `undefined` on a miss. A throw is treated as a miss. */
  read(key: string): unknown | Promise<unknown>;
  /** Store `value` under `key` for `seconds`. A throw is logged; the reply still goes out. */
  write(key: string, value: unknown, seconds: number): void | Promise<void>;
  /** Drop one key, or every key starting with `prefix` (what `app.invalidateCache()` calls). */
  invalidate(target: string | { prefix: string }): void | Promise<void>;
};

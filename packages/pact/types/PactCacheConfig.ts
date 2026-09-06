import type { CacherOptions } from '@tundralibs/cacher';
import type { PactCacheType } from './PactCacheType.ts';

/**
 * Hook-result caching — OPT-IN. With no config nothing is cached and
 * every resolution hits the hooks; a type participates only when given
 * a positive TTL here (`engine` defaults to the in-process MEMORY).
 * Mirrors norm's cache config, minus the instance name, which pact owns
 * (see `Pact._cacheName`).
 */
export type PactCacheConfig = {
  /**
   * Cacher engine name — `'MEMORY'` (default, in-process), `'REDIS'`,
   * `'MEMCACHED'`, or any engine registered on the `@tundralibs/cacher`
   * singleton.
   */
  engine?: string;
  /**
   * Per-type TTL in MINUTES; a type participates only when its TTL is a
   * positive integer. Expiry is always FIXED (never windowed): auth data
   * must go stale on a bounded clock, so a revocation cannot be masked
   * by a hot cache entry resetting its own expiry. Grants changed in app
   * storage are invisible to pact — call `invalidatePrincipal` after
   * such writes rather than waiting out the TTL.
   */
  ttl?: Partial<Record<PactCacheType, number>>;
  /**
   * Options forwarded verbatim to `Cacher.create` for every per-type
   * instance (e.g. a Redis host/port/password).
   */
  options?: CacherOptions & Record<string, unknown>;
};

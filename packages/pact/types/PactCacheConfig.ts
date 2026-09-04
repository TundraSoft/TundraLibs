import type { CacherOptions } from '@tundralibs/cacher';
import type { PactCacheType } from './PactCacheType.ts';

/**
 * Hook-result caching. Always initialized: with no config pact defaults
 * to the in-process MEMORY engine with
 * `ttl: { principal: 15, apiKey: 5, session: 5 }` (minutes). A supplied
 * `ttl` record replaces that default wholesale — zeroing a type is the
 * explicit opt-out — and a type participates only when its TTL is a
 * positive integer. Mirrors norm's cache config, minus the instance
 * name, which pact owns (see `Pact._cacheName`).
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

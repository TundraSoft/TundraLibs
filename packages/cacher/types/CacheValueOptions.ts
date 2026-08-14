import type { CacheValue } from './CacheValue.ts';

/**
 * Options for setting a value in the cache.
 *
 * @see {@link AbstractCacher.set} The method that uses these options
 * @example
 * ```ts
 * import { MemoryCacher } from '@tundralibs/cacher/engines';
 *
 * const cache = new MemoryCacher('demo', {});
 * const value = { hello: 'world' };
 *
 * // Set with custom expiry (10 minutes)
 * await cache.set('key', value, { expiry: 600 });
 *
 * // Set with window mode enabled (extends expiry on each access)
 * await cache.set('key', value, { window: true });
 *
 * // Set with both custom expiry and window mode
 * await cache.set('key', value, { expiry: 600, window: true });
 * ```
 */
export type CacheValueOptions = Partial<
  Pick<CacheValue, 'expiry' | 'window'>
>;

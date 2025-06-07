/**
 * Base configuration options for all cache drivers.
 *
 * These options are common to all cacher implementations and can be extended
 * by specific implementations with their own additional options.
 *
 * @see {@link AbstractCacher} The base class for all cacher implementations
 * @see {@link MemoryCacherOptions} Options for in-memory caching
 * @see {@link MemCacherOptions} Options for Memcached integration
 * @see {@link RedisCacherOptions} Options for Redis integration
 * @see {@link CacherConfigError} Error thrown when options are invalid
 * @example
 * ```ts
 * const baseOptions: CacherOptions = {
 *   defaultExpiry: 300 // 5 minutes
 * };
 * ```
 */
export type CacherOptions = {
  /**
   * The default expiry time for cached items, in seconds.
   * 0 means never expire. Maximum of 6hrs (21600 seconds).
   * Default is 300 seconds (5 minutes).
   */
  defaultExpiry?: number;
};

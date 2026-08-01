/**
 * Represents a value stored in the cache.
 *
 * This internal structure wraps the actual data with metadata about expiry and window mode.
 * It's used by all cacher implementations to store values consistently.
 *
 * @see {@link AbstractCacher} For the class that uses this type
 */
export type CacheValue = {
  /**
   * The stringified data to be stored in the cache.
   * This is the JSON string representation of the original value.
   */
  data: string;

  /**
   * The expiry time in seconds.
   * A value of 0 means no expiry.
   */
  expiry: number;

  /**
   * Whether window mode is enabled for this cache entry.
   * If true, the expiry time will be reset each time the value is accessed.
   */
  window: boolean;
};

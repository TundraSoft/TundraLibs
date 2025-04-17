import type { CacherOptions } from '../../../types/mod.ts';

/**
 * Configuration options for the Memcached cacher.
 *
 * @extends CacherOptions
 * @see {@link MemCacher} The class that uses these options
 * @example
 * ```ts
 * const options: MemCacherOptions = {
 *   engine: 'MEMCACHED',
 *   host: 'localhost',
 *   port: 11211,
 *   defaultExpiry: 600 // 10 minutes
 * };
 * ```
 */
export type MemCacherOptions = CacherOptions & {
  /**
   * The cacher engine identifier. Must be 'MEMCACHED'.
   */
  engine: 'MEMCACHED';

  /**
   * The Memcached server host.
   * Required.
   */
  host: string;

  /**
   * The Memcached server port.
   * Defaults to 11211 if not specified.
   */
  port?: number;
};

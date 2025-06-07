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
   * The Memcached server host.
   * Required.
   */
  host: string;

  /**
   * The Memcached server port.
   * Defaults to 11211 if not specified.
   */
  port?: number;

  /**
   * Maximum buffer size for the Memcached client (in mb). Defaults to 10
   */
  maxBufferSize?: number;
};

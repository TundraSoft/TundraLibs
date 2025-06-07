import type { CacherOptions } from '../../../types/mod.ts';

/**
 * Configuration options for the Redis cacher.
 *
 * @extends CacherOptions
 * @see {@link RedisCacher} The class that uses these options
 * @example
 * ```ts
 * const options: RedisCacherOptions = {
 *   engine: 'REDIS',
 *   host: 'localhost',
 *   port: 6379,
 *   password: 'securepassword',
 *   db: 0,
 *   defaultExpiry: 600 // 10 minutes
 * };
 * ```
 */
export type RedisCacherOptions = CacherOptions & {
  /**
   * The Redis server host.
   * Required.
   */
  host: string;

  /**
   * The Redis server port.
   * Defaults to 6379 if not specified.
   */
  port: number;

  /**
   * Optional Redis username for authentication.
   */
  username?: string;

  /**
   * Optional Redis password for authentication.
   */
  password?: string;

  /**
   * Optional Redis database number.
   */
  db?: number;

  /**
   * Path to TLS certificate file for secure connections.
   */
  certPath: string;
};

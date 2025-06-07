import { CacherError } from '../../../errors/Base.ts';

/**
 * Error thrown when a connection to a Redis server fails.
 *
 * This error is thrown when the cacher fails to establish a connection with the Redis server,
 * either during initialization or when attempting to perform operations without a valid connection.
 *
 * @extends CacherError
 * @see {@link RedisCacher} The class that might throw this error
 * @see {@link RedisCacherOptions} For the connection configuration options
 * @example
 * ```ts
 * try {
 *   await redis.init();
 * } catch (error) {
 *   if (error instanceof RedisCacherConnectError) {
 *     console.error('Connection error:', error.message);
 *   }
 * }
 * ```
 */
export class RedisCacherConnectError extends CacherError {
  /**
   * Creates a new Redis connection error.
   *
   * @param meta - Connection metadata and context
   * @param meta.name - The name of the cacher instance
   * @param meta.host - The Redis server host
   * @param meta.port - The Redis server port
   * @param meta.username - Optional Redis server username
   * @param meta.password - Optional Redis server password
   * @param meta.db - Optional Redis database number
   * @param cause - The underlying error that caused this error, if any
   */
  constructor(
    meta: {
      name: string;
      host: string;
      port?: number;
      username?: string;
      password?: string;
      db?: number;
    } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      `Error/Failed to establish connection with REDIS Server (${meta.host}:${meta.port}${
        (meta.username) ? ' (with credentials)' : ''
      })`,
      { engine: 'REDIS', ...meta },
      cause,
    );
  }
}

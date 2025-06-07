import { CacherError } from '../../../errors/Base.ts';

/**
 * Error thrown when a connection to a Memcached server fails.
 *
 * This error is thrown when the cacher fails to establish a connection with the Memcached server,
 * either during initialization or when attempting to perform operations without a valid connection.
 *
 * @extends CacherError
 * @see {@link MemCacher} The class that might throw this error
 * @see {@link MemCacherOptions} For the connection configuration options
 * @example
 * ```ts
 * try {
 *   await memcached.init();
 * } catch (error) {
 *   if (error instanceof MemCacherConnectError) {
 *     console.error('Connection error:', error.message);
 *   }
 * }
 * ```
 */
export class MemCacherConnectError extends CacherError {
  /**
   * Creates a new Memcached connection error.
   *
   * @param meta - Connection metadata and context
   * @param meta.name - The name of the cacher instance
   * @param meta.host - The Memcached server host
   * @param meta.port - The Memcached server port
   * @param meta.username - Optional Memcached server username
   * @param meta.password - Optional Memcached server password
   * @param meta.db - Optional Memcached database number
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
      'Error/Failed to establish connection with MEMCACHED Server (${host}:${port}' +
        (meta.username)
        ? ' (with credentials)'
        : '' + ')',
      { engine: 'MEMCACHED', ...meta },
      cause,
    );
  }
}

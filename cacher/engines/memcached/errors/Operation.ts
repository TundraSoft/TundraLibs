import { CacherOperationError } from '../../../errors/mod.ts';

/**
 * Error thrown when a Memcached operation fails.
 *
 * This error is thrown when a cache operation (GET, SET, DELETE, etc.) fails
 * on the Memcached server.
 *
 * @extends CacherOperationError
 * @see {@link MemCacher} The class that might throw this error
 * @see {@link CacherOperationError} The base error class for operation failures
 * @example
 * ```ts
 * try {
 *   await memcached.set('key', 'value');
 * } catch (error) {
 *   if (error instanceof MemCacherOperationError) {
 *     console.error('Operation error:', error.message);
 *   }
 * }
 * ```
 */
export class MemCacherOperationError extends CacherOperationError {
  /**
   * Creates a new Memcached operation error.
   *
   * @param meta - Operation metadata and context
   * @param meta.name - The name of the cacher instance
   * @param meta.operation - The type of operation that failed
   * @param meta.key - The cache key involved in the operation, if applicable
   * @param cause - The underlying error that caused this error, if any
   */
  constructor(
    meta: {
      name: string;
      operation: 'GET' | 'SET' | 'HAS' | 'DELETE' | 'CLEAR' | 'OTHER';
      key?: string;
    },
    cause?: Error,
  ) {
    super(
      'Error performing ${operation}',
      { engine: 'MEMCACHED', ...meta },
      cause,
    );
  }
}

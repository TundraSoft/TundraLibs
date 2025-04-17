import { CacherOperationError } from '../../../errors/mod.ts';

/**
 * Error thrown when a Redis operation fails.
 *
 * This error is thrown when a cache operation (GET, SET, DELETE, etc.) fails
 * on the Redis server.
 *
 * @extends CacherOperationError
 * @see {@link RedisCacher} The class that might throw this error
 * @example
 * ```ts
 * try {
 *   await redis.set('key', 'value');
 * } catch (error) {
 *   if (error instanceof RedisCacherOperationError) {
 *     console.error('Operation error:', error.message);
 *   }
 * }
 * ```
 */
export class RedisCacherOperationError extends CacherOperationError {
  /**
   * Creates a new Redis operation error.
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
    super('Error performing ${operation}', { engine: 'REDIS', ...meta }, cause);
  }
}

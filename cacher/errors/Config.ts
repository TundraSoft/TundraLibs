import { CacherError, type CacherErrorMeta } from './Base.ts';

/**
 * Error thrown when a cacher configuration is invalid.
 *
 * This specialized error is used when validation of cacher configuration options fails.
 * It includes details about which configuration key had an issue and what value caused the problem.
 *
 * @extends CacherError
 * @template M - The error metadata type
 * @see {@link AbstractCacher} The class that might throw this error
 * @example
 * ```ts
 * try {
 *   new RedisCacher('cache', { port: -1 });
 * } catch (error) {
 *   if (error instanceof CacherConfigError) {
 *     console.error(`Configuration error for ${error.meta.configKey}:`, error.message);
 *   }
 * }
 * ```
 */
export class CacherConfigError<
  M extends CacherErrorMeta & { configKey: string; configValue?: unknown },
> extends CacherError<M> {
  /**
   * Creates a new cacher configuration error.
   *
   * @param message - The error message
   * @param meta - Error metadata including the problematic configuration key and value
   * @param meta.configKey - The configuration key that caused the error
   * @param meta.configValue - The invalid configuration value
   * @param cause - The underlying error that caused this error, if any
   */
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}

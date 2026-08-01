/**
 * @fileoverview Base error class for the drivers package.
 *
 * Provides the foundation for all driver-related errors with structured
 * metadata and cause chain preservation.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { DriverError } from '@tundralibs/drivers/errors';
 *
 * class CustomDriverError extends DriverError<{ customField: string }> {
 *   constructor(message: string, customField: string, cause?: Error) {
 *     super(message, { customField }, cause);
 *   }
 * }
 * ```
 */

import { BaseError } from '@tundralibs/utils/BaseError';

/**
 * Base error class for the drivers package. Every driver error
 * ({@link EngineError}, `PgServerError`, …) extends this, giving callers a
 * single package-specific type to catch. It is a deliberately thin
 * extension point over {@link BaseError} — subclasses add the code,
 * templating, and metadata; this class contributes only the shared
 * identity, inheriting `BaseError`'s `(message, meta, cause?)` constructor
 * and its `'${message}'` message template unchanged.
 *
 * @template M - Structured error metadata shape.
 */
export class DriverError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {}

/**
 * @fileoverview Package base error — every Slogger error derives from this.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';

/**
 * Base class for every error thrown by `@tundralibs/slogger`.
 *
 * Extends {@link BaseError} so the project-wide error contract
 * (structured `context`, `${var}` substitution, cause chaining, JSON
 * serialisation) is preserved. Callers branch on `instanceof
 * SloggerError` to filter package errors out of an unrelated catch,
 * or on the concrete subclasses — {@link SloggerConfigError},
 * {@link SloggerHandlerError}, {@link SloggerFinalizeError} — for
 * scenario-specific handling.
 *
 * @typeParam M - Shape of structured `context` attached to the error.
 */
export class SloggerError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  // `name` is set automatically by BaseError via this.constructor.name.
}

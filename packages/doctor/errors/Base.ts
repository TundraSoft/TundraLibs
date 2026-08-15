/**
 * @fileoverview Package base error — every Doctor error derives from this.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';

/**
 * Base class for every error thrown by `@tundralibs/doctor`.
 *
 * Extends {@link BaseError} so the project-wide error contract
 * (`context` payload, `${var}` substitution, cause chaining, JSON
 * serialisation) is preserved. Callers branch on `instanceof
 * DoctorError` to filter package errors out of an unrelated catch.
 *
 * @typeParam M - Shape of structured `context` attached to the error.
 */
export class DoctorError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  /** Emit the message verbatim; Doctor errors are written whole at the throw site. */
  protected override get _messageTemplate(): string {
    return '${message}';
  }
}

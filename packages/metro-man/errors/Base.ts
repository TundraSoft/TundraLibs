/**
 * @fileoverview Package base error — every MetroMan error derives from this.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';

/**
 * Base class for every error thrown by `@tundralibs/metro-man`.
 *
 * Extends {@link BaseError} so the project-wide error contract
 * (`context` payload, `${var}` substitution, cause chaining, JSON
 * serialisation) is preserved. Callers branch on `instanceof
 * MetroManError` to filter package errors out of an unrelated catch.
 *
 * @typeParam M - Shape of structured `context` attached to the error.
 */
export class MetroManError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  protected override get _messageTemplate(): string {
    return '${message}';
  }
}

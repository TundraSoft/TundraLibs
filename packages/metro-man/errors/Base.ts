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
  /**
   * Every MetroMan throw site passes an already-formed message, so the
   * template interpolates that and nothing else — the structured
   * `context` stays queryable rather than being spliced into the text.
   */
  protected override get _messageTemplate(): string {
    return '${message}';
  }
}

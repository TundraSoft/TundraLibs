/**
 * @fileoverview Base error class for `@tundralibs/id`.
 *
 * Every error thrown by the ID generators extends this class, inheriting
 * the project-wide error contract from `BaseError` (typed `context`,
 * `${var}` substitution in messages, cause chains, JSON serialisation).
 *
 * @module
 *
 * @example
 * ```ts
 * import { IDError } from '@tundralibs/id/errors';
 * import { ObjectID } from '@tundralibs/id/ObjectID';
 *
 * try {
 *   ObjectID(-1);
 * } catch (e) {
 *   if (e instanceof IDError) {
 *     console.error(e.context); // typed metadata
 *   }
 * }
 * ```
 */

import { BaseError } from '@tundralibs/utils/BaseError';

/**
 * Base error for the id package. Concrete failures surface as
 * {@link InvalidOptionError} (bad generator arguments),
 * {@link InvalidULIDError} (malformed ULID decode), or
 * {@link MonotonicOverflowError} (monotonic ULID randomness exhausted).
 * Mirrors the pattern `@tundralibs/radrouter` and `@tundralibs/restler`
 * use so caller-side handling looks the same across packages.
 *
 * @template M - Shape of the error metadata; defaults to a generic record.
 */
export class IDError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  // `name` is set automatically by BaseError's constructor via
  // `this.constructor.name`; no override needed.
}

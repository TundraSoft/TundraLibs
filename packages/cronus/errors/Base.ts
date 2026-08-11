/**
 * @fileoverview {@link CronusError} — the package base error.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';

/**
 * Base class for every error thrown by `@tundralibs/cronus`. Extends
 * `BaseError` so all package errors share the project-wide contract
 * (typed `context`, `${var}` substitution, cause chains, JSON
 * serialisation).
 */
export class CronusError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  // `name` is set automatically by BaseError via this.constructor.name.
}

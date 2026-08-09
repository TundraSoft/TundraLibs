/**
 * @fileoverview {@link TracerError} — the package base error.
 *
 * @author TundraSoft
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';

/**
 * Base class for every error thrown by `@tundralibs/tracer`. Extends
 * `BaseError` so all package errors share the project-wide contract (typed
 * `context`, `${var}` substitution, cause chains, JSON serialisation).
 */
export class TracerError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  // `name` is set automatically by BaseError via this.constructor.name.
}

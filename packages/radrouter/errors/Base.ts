/**
 * @fileoverview Base error class for `@tundralibs/radrouter`.
 *
 * All radrouter errors extend this class, inheriting the project-
 * wide error contract from `BaseError` (typed `context`, `${var}`
 * substitution in messages, cause chains, JSON serialisation).
 *
 * @module
 *
 * @example
 * ```ts
 * import { RadRouter, RadRouterError } from '@tundralibs/radrouter';
 *
 * type MW = () => Promise<void>;
 * const router = new RadRouter<MW>();
 * const mw: MW = async () => {};
 *
 * try {
 *   router.get('/users/:bad name:', [mw]);
 * } catch (e) {
 *   if (e instanceof RadRouterError) {
 *     console.error(e.context); // typed metadata
 *   }
 * }
 * ```
 */

import { BaseError } from '@tundralibs/utils';

/**
 * Base error for the radrouter package. Concrete radrouter errors
 * extend this class; mirrors the pattern `@tundralibs/drivers` and
 * `@tundralibs/norm` use so caller-side handling looks the same
 * across packages.
 *
 * @template M - Shape of the error metadata; defaults to a generic
 *   record.
 */
export class RadRouterError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  // `name` is set automatically by BaseError's constructor via
  // `this.constructor.name`; no override needed.
}

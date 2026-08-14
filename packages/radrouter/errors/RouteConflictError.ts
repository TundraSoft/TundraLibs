/**
 * @fileoverview {@link RouteConflictError} — thrown when a route
 * registration places a parameter binding that conflicts with an
 * existing one at the same trie position. Covers plain-param
 * collisions, suffix-param collisions, and greedy-param
 * collisions. `error.context` carries the existing and new
 * parameter names plus the offending path.
 *
 * @module
 */

import { RadRouterError } from './Base.ts';

/** Metadata attached to a {@link RouteConflictError}. */
export type RouteConflictErrorMeta = {
  /** Path being registered when the conflict surfaced. */
  path: string;
  /** Name of the existing parameter at the conflicting position. */
  existingParamName?: string;
  /** Name of the conflicting new parameter. */
  newParamName?: string;
  /** Shared suffix, when the conflict is between `:name:<suffix>` siblings. */
  suffix?: string;
};

/**
 * Thrown when two different `:name:` (or `:name:<literal>`, or
 * greedy) bindings would have to share a trie position. The
 * router refuses rather than silently shadowing one with the
 * other.
 *
 * @example
 * ```ts
 * import { RadRouter, RouteConflictError } from '@tundralibs/radrouter';
 *
 * type MW = () => Promise<void>;
 * const router = new RadRouter<MW>();
 * const mw: MW = async () => {};
 *
 * router.get('/users/:id:', [mw]);
 * try {
 *   router.get('/users/:userId:', [mw]); // same position, different name
 * } catch (e) {
 *   if (e instanceof RouteConflictError) {
 *     console.error(`Conflict at ${e.context.path}`);
 *   }
 * }
 * ```
 */
export class RouteConflictError extends RadRouterError<RouteConflictErrorMeta> {
  /**
   * Raised by the router when a registration collides with an existing
   * parameter binding; construct one directly only to re-raise that
   * failure from wrapping code.
   *
   * @param message - `${var}` placeholders are substituted from `meta`.
   * @param meta - Surfaced on `error.context`.
   * @param cause - Original error to chain, if any.
   */
  constructor(message: string, meta: RouteConflictErrorMeta, cause?: Error) {
    super(message, meta, cause);
  }
}

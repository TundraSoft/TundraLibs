import type { Middleware } from './Middleware.ts';
import type { RouteParams } from './RouteParams.ts';

/**
 * Result of a successful route lookup.
 *
 * @template M - The middleware type the router is parameterised
 *   over. Defaults to the unconstrained {@link Middleware} shape.
 */
export type RouteMatch<M = Middleware> = {
  /** Global + route-specific middlewares in registration order. */
  middlewares: M[];
  /**
   * Captured path parameters. A **null-prototype** object with no
   * inherited `Object.prototype` methods — read it as data, not via
   * `.hasOwnProperty`/`.toString`. See {@link RouteParams}.
   */
  params: RouteParams;
};

import type { HTTPMethod } from '@tundralibs/compat/http';
import type { Middleware } from './Middleware.ts';

/**
 * Internal record stored per route + method + version slot. Surfaced
 * as a type for advanced consumers that want to introspect the
 * router's slot map; not produced by {@link RadRouter.find}.
 *
 * @template M - The middleware type the router is parameterised
 *   over. Defaults to the unconstrained {@link Middleware} shape.
 */
export type RouteHandler<M = Middleware> = {
  middlewares: M[];
  method: HTTPMethod;
  version?: string;
};

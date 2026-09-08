/**
 * @fileoverview OpenAPI metadata a GUARD middleware carries: the security
 * requirement it enforces and the schemes it accepts. `app.route()` reads
 * it off the route's middleware chain, so a route guarded by
 * `authorize('Posts', 'READ')` documents its requirement and declares its
 * schemes without the author repeating `security: [...]` — an explicit
 * `openapi.security` on the route still wins.
 *
 * @module
 */

/** The metadata key (`Symbol.for`, so a second copy of the package reads it too). */
export const MIDDLEWARE_OPENAPI: unique symbol = Symbol.for(
  'rapid.middleware.openapi',
) as never;

/** What a guard declares about itself for the OpenAPI document. */
export type RapidMiddlewareOpenApi = {
  /** Scheme names the operation requires — any one of them satisfies it. */
  readonly security: readonly string[];
  /** The schemes to declare under `components.securitySchemes`, by name. */
  readonly securitySchemes?: Readonly<Record<string, Record<string, unknown>>>;
};

/**
 * Stamp `middleware` with the requirement it enforces. Mutates and
 * returns the same function.
 */
export function markOpenApi<M extends object>(
  middleware: M,
  meta: RapidMiddlewareOpenApi,
): M {
  return Object.assign(middleware, { [MIDDLEWARE_OPENAPI]: meta });
}

/** The OpenAPI metadata a middleware carries, or `undefined`. */
export function middlewareOpenApi(
  middleware: object,
): RapidMiddlewareOpenApi | undefined {
  return (middleware as unknown as Record<symbol, RapidMiddlewareOpenApi>)[
    MIDDLEWARE_OPENAPI
  ];
}

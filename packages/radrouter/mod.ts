/**
 * @fileoverview `@tundralibs/radrouter` — compressed radix-tree
 * HTTP router.
 *
 * - Path-compressed trie with multi-character node labels — shared
 *   prefixes collapse into single nodes, lookup walks the URL with one
 *   integer cursor (no `path.split('/')` allocation per request).
 * - `RadRouter<M>` is parameterised over the consumer's middleware
 *   function type. The Router never reads `ctx`; the consumer's typed
 *   alias propagates through every chain entry.
 * - Versioned endpoints with three-tier fallback (exact >
 *   `defaultVersion` > unversioned).
 * - Variable patterns: `:name:`, `:name:-*` (greedy suffix),
 *   `*-:name:` (greedy prefix), and literal-suffix params
 *   (`:name:.gz`).
 * - Case-sensitive by default (RFC 3986); `caseSensitive: false`
 *   opt-in.
 * - Lenient slash handling on registration, strict on lookup.
 *
 * `RadRouter` is structurally agnostic — it stores and dispatches
 * middleware functions but never reads `ctx`. Each consumer defines
 * their own typed middleware alias and supplies it as `M`.
 *
 * @module
 *
 * @example
 * ```ts
 * import { RadRouter } from '@tundralibs/radrouter';
 *
 * type AppCtx = { request: Request; state: { user?: string } };
 * type AppMW = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;
 *
 * const router = new RadRouter<AppMW>();
 * router.get('/users/:id:', [async (ctx, next) => {
 *   // ctx is typed AppCtx end-to-end
 *   await next();
 * }]);
 *
 * const match = router.find('GET', '/users/42');
 * // match.params === { id: '42' }
 * ```
 */

export { RadRouter } from './RadRouter.ts';
export type {
  ClearOptions,
  HTTPMethod,
  Middleware,
  RouteHandler,
  RouteMatch,
  RouteParams,
  RouterOptions,
} from './types/mod.ts';
export {
  DuplicateRouteError,
  type DuplicateRouteErrorMeta,
  MalformedPathError,
  type MalformedPathErrorMeta,
  RadRouterError,
  RouteConflictError,
  type RouteConflictErrorMeta,
} from './errors/mod.ts';

/**
 * @fileoverview The HTTP route decorators — `@GET`/`@POST`/`@PUT`/
 * `@PATCH`/`@DELETE`. METADATA-ONLY (TC39 standard): they return
 * `undefined`, never wrap the method — they record a
 * {@link RapidDecoration} into the side-table for the module tier to
 * mount. Paths are radrouter-NATIVE (`/users/:id:`); grammar is
 * enforced by radrouter itself at mount/start.
 *
 * Decorations are keyed by the method's NAME in the class's decorator
 * metadata (see `registry.ts`), so stacking ORDER does not matter: a
 * third-party wrapping decorator may sit above or below a rapid one — the
 * mount tier binds whatever function is installed under that name.
 *
 * COMPILE-TIME CONTRACT at the `@` site: the method must return the
 * {@link RapidModuleReply} envelope, and its parameters must match the
 * `bind` tuple (the tuple DRIVES the parameter types — arity overflow
 * is caught at compile time; underflow and `any` escape it, and the mount
 * tier passes whatever the binds produce, so keep the tuple honest).
 *
 * The same method may carry several decorations (aliases, other
 * transports): every application appends its own entry.
 *
 * @module
 */

import type { HTTPMethod } from '@tundralibs/compat/http';
import type {
  RapidBinds,
  RapidHTTPMiddleware,
  RapidModuleReply,
  RapidRouteOptions,
} from '../types/mod.ts';
import { RapidError } from '../errors/mod.ts';
import {
  assertMethodContext,
  assertMiddlewareList,
  recordDecoration,
} from './registry.ts';

/** Options for the HTTP route decorators. */
export type RouteDecoratorOptions<A extends readonly unknown[]> = {
  /**
   * Argument binders, IN METHOD-PARAMETER ORDER — `bind[0]` produces
   * the first parameter, and the tuple types the signature.
   * @default [] — the method takes no parameters
   */
  bind?: RapidBinds<A>;
  /**
   * Radrouter version slot for this route — overrides the owning
   * `@Module`'s `version` default, when both are set. Optional, like
   * `bind`: most routes need neither versioning nor an explicit bind
   * tuple, and a REQUIRED version would force every route in an
   * unversioned API to declare one for no benefit.
   * @default the owning `@Module`'s `version`, else unversioned
   */
  version?: string;
  /** One-line OpenAPI operation summary. */
  summary?: string;
  /** Longer OpenAPI operation description (Markdown allowed by the spec). */
  description?: string;
  /**
   * OpenAPI tags for this route, merged OVER the owning `@Module`'s tags
   * (which default to the module's name) and deduplicated at mount.
   */
  tags?: readonly string[];
  /**
   * OpenAPI operation id — the key an SDK generator names its client
   * methods by.
   * @default `<ModuleName>_<method>` at mount (the bare method name for
   *   an unnamed class)
   */
  operationId?: string;
  /**
   * Security-scheme NAMES this route requires (`['bearerAuth']`); an
   * EMPTY array marks it deliberately public, overriding the owning
   * `@Module`'s `security` default. Documentation only — enforcement is
   * the `authorize()` middleware's job. `bearerAuth` is declared in the
   * document for you; other schemes via `openapi({ securitySchemes })`.
   */
  security?: readonly string[];
  /**
   * The response body's shape. `buildOpenApi` emits its `toOpenAPI()` as
   * the 200 schema, and — when the schema can also `parse` (a guardian
   * schema qualifies as-is) — DEVELOPMENT mode ENFORCES it: a
   * return-channel reply whose `content` fails the schema becomes a loud
   * `RAPID_RESPONSE_INVALID` (500) instead of shipping a response the
   * docs lie about. Scope of the check: success replies only (2xx or
   * unset status, no `redirect`), data content only (bytes and streams
   * skip), the DATA before any template renders it; enforce-only — a
   * stripping/coercing schema never alters what is sent, and PRODUCTION
   * never runs the parse. rapid takes NO dependency on
   * `@tundralibs/guardian` for this — anything structurally shaped like
   * a guardian schema works, emitter-only shapes stay documentation-only.
   * The request side is `bind: [payload(Schema)]` (a schema OBJECT —
   * validates and documents the body at once).
   */
  response?: {
    parse?: (value: unknown) => unknown;
    toOpenAPI?: () => unknown;
    toJSONSchema?: () => unknown;
  };
  /**
   * This route answers with a COLLECTION. Documentation only: with no
   * `response` the documented body becomes an array of object instead
   * of the bare-object default, and the operation gains the
   * `server.paging` request parameters plus the three response headers.
   *
   * A declared `response` is used VERBATIM — declare the array
   * yourself, nothing is wrapped. Independent of the runtime `paging`
   * reply key, which is what sets the headers: an envelope route leaves
   * this unset, declares its own object schema, and still gets them.
   */
  paging?: boolean;
  /**
   * Serve this route on the `api` surface ONLY — absent from the `ui`
   * surface, so `onlyApi()`-scoped middleware cannot be bypassed via the
   * un-prefixed URL. Requires `server.api`; a `RAPID_CONFIG` error at
   * registration otherwise. See `RapidRouteOptions.apiOnly`.
   */
  apiOnly?: boolean;
  /**
   * Serve this route on the `ui` surface ONLY — absent from the `api`
   * surface, which otherwise serves every templated route as JSON. The
   * mirror of `apiOnly`; the two exclude each other. See
   * `RapidRouteOptions.uiOnly`.
   */
  uiOnly?: boolean;
  /**
   * HTML template for this route (see `@tundralibs/rapid/ui`): a bare
   * `RapidTemplate` or the `{ render, layout?, title?, meta?, prefer? }`
   * object form — `title` reaches both wrapper tiers (and swap replies
   * as the `rapid-title` header), `meta` the core's `<head>` only, and
   * `layout: false` opts out of the module tier.
   * Validated at MOUNT time (`RAPID_CONFIG` on a wrong import), applied
   * on HTTP only — a method also decorated `@SOCKET`/`@JOB` carries it
   * harmlessly there (same rule as the reply envelope's `cookies`/
   * `redirect`).
   */
  template?: RapidRouteOptions['template'];
  /** Page layout — sugar for the object form's `layout` (which wins). */
  layout?: RapidRouteOptions['layout'];
  /**
   * Route-scoped middleware for THIS route — the same chain a plain
   * `app.get(path, ...middleware, handler)` takes, so an `authorize()` or
   * a `rateLimit()` guards one decorated route. Runs inside the app onion,
   * after the owning `@Module`'s `middleware`, in array order. HTTP only
   * (a method also decorated `@SOCKET` declares that transport's chain on
   * `@SOCKET` itself). Each entry must be a function — checked NOW.
   * @default [] — the module's `middleware` alone, if any
   */
  middleware?: readonly RapidHTTPMiddleware[];
};

/** The decorator signature every route factory returns. */
type RouteDecorator<This, A extends readonly unknown[]> = (
  target: (this: This, ...args: A) => RapidModuleReply,
  context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: A) => RapidModuleReply
  >,
) => void;

/**
 * The factory shape, as an OVERLOAD PAIR. Without `bind`, `A` is
 * pinned to `[]` so the decorated method must take NO parameters —
 * otherwise TypeScript infers `A` from the method's own signature and
 * every parameter check silently disappears, while the mount tier
 * would pass `undefined` for each one. With `bind`, the tuple drives
 * the parameter types as documented. Options WITHOUT `bind` (summary,
 * tags, security, …) keep the no-parameter pin.
 */
type RoutePath = string | readonly string[];

type RouteFactory = {
  <This>(path: RoutePath): RouteDecorator<This, []>;
  <This, A extends readonly unknown[]>(
    path: RoutePath,
    options: RouteDecoratorOptions<A> & { bind: RapidBinds<A> },
  ): RouteDecorator<This, A>;
  <This>(
    path: RoutePath,
    options: Omit<RouteDecoratorOptions<[]>, 'bind'>,
  ): RouteDecorator<This, []>;
};

/**
 * One path, or several, normalised to an array. Several paths mount the
 * SAME method at each — an alias set in one decoration, rather than the
 * decorator stacked N times.
 *
 * @throws {RapidError} RAPID_CONFIG on an empty array (the route would
 *   never mount, silently) or a duplicate entry.
 */
function normalisePaths(method: string, path: RoutePath): readonly string[] {
  const list = typeof path === 'string' ? [path] : [...path];
  if (list.length === 0) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `@${method}: path cannot be an empty array — the route would never mount`,
      details: { decorator: method },
    });
  }
  if (new Set(list).size !== list.length) {
    throw new RapidError('RAPID_CONFIG', {
      message: `@${method}: path entries must be unique — got '${
        list.join(', ')
      }'`,
      details: { decorator: method, path: list.join(', ') },
    });
  }
  return list;
}

/**
 * Shared builder — one implementation for the five verbs.
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
function route<This, A extends readonly unknown[]>(
  method: HTTPMethod,
  path: RoutePath,
  options: RouteDecoratorOptions<A>,
): RouteDecorator<This, A> {
  // Normalised (and validated) at decoration time, like the middleware
  // list below — an empty array fails at import, not as a route that
  // silently never appears.
  const paths = normalisePaths(method, path);
  return (_target, context): void => {
    assertMethodContext(context, method);
    assertMiddlewareList(`@${method}`, options.middleware);
    recordDecoration(context, {
      kind: 'HTTP',
      method,
      paths,
      binds: options.bind ?? [],
      methodName: String(context.name),
      ...(options.version !== undefined ? { version: options.version } : {}),
      ...(options.summary !== undefined ? { summary: options.summary } : {}),
      ...(options.description !== undefined
        ? { description: options.description }
        : {}),
      ...(options.tags !== undefined ? { tags: options.tags } : {}),
      ...(options.operationId !== undefined
        ? { operationId: options.operationId }
        : {}),
      ...(options.security !== undefined ? { security: options.security } : {}),
      ...(options.response !== undefined ? { response: options.response } : {}),
      ...(options.paging !== undefined ? { paging: options.paging } : {}),
      ...(options.apiOnly !== undefined ? { apiOnly: options.apiOnly } : {}),
      ...(options.uiOnly !== undefined ? { uiOnly: options.uiOnly } : {}),
      ...(options.template !== undefined ? { template: options.template } : {}),
      ...(options.layout !== undefined ? { layout: options.layout } : {}),
      ...(options.middleware !== undefined
        ? { middleware: options.middleware }
        : {}),
    });
  };
}

/**
 * Declare the decorated method as a GET route.
 *
 * ```typescript
 * import { GET, param, type RapidContextResponse } from '@tundralibs/rapid';
 *
 * class Users {
 *   @GET('/users/:id:', { bind: [param('id')] })
 *   find(id: string): RapidContextResponse {
 *     return { content: { id } };
 *   }
 *
 *   @GET('/health') // no bind → the method takes NO params
 *   health(): RapidContextResponse {
 *     return { content: 'ok' };
 *   }
 *
 *   // A LIST mounts the same method at each path, and multiplies with
 *   // the owning @Module's prefixes. Their operationIds are suffixed
 *   // with a slug of the path, since OpenAPI requires unique ids.
 *   @GET(['/users', '/people'])
 *   list(): RapidContextResponse {
 *     return { content: [] };
 *   }
 * }
 * ```
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, on a non-method/static/private target, or on
 *   an empty / duplicated path list.
 */
export const GET: RouteFactory = (
  path: RoutePath,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('GET', path, options);

/**
 * Declare the decorated method as a POST route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, on a non-method/static/private target, or on
 *   an empty / duplicated path list.
 */
export const POST: RouteFactory = (
  path: RoutePath,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('POST', path, options);

/**
 * Declare the decorated method as a PUT route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, on a non-method/static/private target, or on
 *   an empty / duplicated path list.
 */
export const PUT: RouteFactory = (
  path: RoutePath,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('PUT', path, options);

/**
 * Declare the decorated method as a PATCH route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, on a non-method/static/private target, or on
 *   an empty / duplicated path list.
 */
export const PATCH: RouteFactory = (
  path: RoutePath,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('PATCH', path, options);

/**
 * Declare the decorated method as a DELETE route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, on a non-method/static/private target, or on
 *   an empty / duplicated path list.
 */
export const DELETE: RouteFactory = (
  path: RoutePath,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('DELETE', path, options);

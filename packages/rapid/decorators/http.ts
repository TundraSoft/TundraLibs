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
 * is caught; underflow and `any` escape, which is why the mount tier
 * re-checks at runtime).
 *
 * The same method may carry several decorations (aliases, other
 * transports): every application appends its own entry.
 *
 * @module
 */

import type { HTTPMethod } from '@tundralibs/compat/http';
import type { RapidBinds, RapidModuleReply } from '../types/mod.ts';
import { assertMethodContext, recordDecoration } from './registry.ts';

/** Options for the HTTP route decorators. */
export type RouteDecoratorOptions<A extends readonly unknown[]> = {
  /**
   * Argument binders, IN METHOD-PARAMETER ORDER — `bind[0]` produces
   * the first parameter, and the tuple types the signature.
   */
  bind?: RapidBinds<A>;
  /**
   * Radrouter version slot for this route — overrides the owning
   * `@Module`'s `version` default, when both are set. Optional, like
   * `bind`: most routes need neither versioning nor an explicit bind
   * tuple, and a REQUIRED version would force every route in an
   * unversioned API to declare one for no benefit.
   */
  version?: string;
  /** Free-text summary (future OpenAPI generator raw material — no runtime effect today). */
  description?: string;
  /**
   * The response body's shape — METADATA ONLY, no runtime effect
   * today (the method's actual return value is never checked against
   * it). Raw material for a future OpenAPI generator: rapid takes NO
   * dependency on `@tundralibs/guardian` for this — anything
   * structurally shaped like a guardian schema (a `.toOpenAPI()` or
   * `.toJSONSchema()` emitter) works, matching request validation's
   * existing path (`bind: [payload(Schema.parse)]`, no NEW mechanism
   * needed there).
   */
  response?: { toOpenAPI?: () => unknown; toJSONSchema?: () => unknown };
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
 * the parameter types as documented.
 */
type RouteFactory = {
  <This>(path: string): RouteDecorator<This, []>;
  <This, A extends readonly unknown[]>(
    path: string,
    options: RouteDecoratorOptions<A> & { bind: RapidBinds<A> },
  ): RouteDecorator<This, A>;
};

/**
 * Shared builder — one implementation for the five verbs.
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
function route<This, A extends readonly unknown[]>(
  method: HTTPMethod,
  path: string,
  options: RouteDecoratorOptions<A>,
): RouteDecorator<This, A> {
  return (_target, context): void => {
    assertMethodContext(context, method);
    recordDecoration(context, {
      kind: 'HTTP',
      method,
      path,
      binds: options.bind ?? [],
      methodName: String(context.name),
      ...(options.version !== undefined ? { version: options.version } : {}),
      ...(options.description !== undefined
        ? { description: options.description }
        : {}),
      ...(options.response !== undefined ? { response: options.response } : {}),
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
 * }
 * ```
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
export const GET: RouteFactory = (
  path: string,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('GET', path, options);

/**
 * Declare the decorated method as a POST route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
export const POST: RouteFactory = (
  path: string,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('POST', path, options);

/**
 * Declare the decorated method as a PUT route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
export const PUT: RouteFactory = (
  path: string,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('PUT', path, options);

/**
 * Declare the decorated method as a PATCH route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
export const PATCH: RouteFactory = (
  path: string,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('PATCH', path, options);

/**
 * Declare the decorated method as a DELETE route. Without `bind` the
 * method must take no parameters (see {@link GET}).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
export const DELETE: RouteFactory = (
  path: string,
  options: RouteDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => route('DELETE', path, options);

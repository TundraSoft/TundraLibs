/**
 * @fileoverview Transport-scoping sugar for universal middleware:
 * `only*` wrappers SKIP other transports (the invocation continues),
 * `guard*` wrappers REJECT them (fail-closed — for auth-class
 * middleware that must never be silently bypassed by a transport it
 * doesn't understand). Wrapped middleware carry scope METADATA the
 * boot-time diagnostics read (e.g. "socket commands registered but no
 * middleware reaches SOCKET").
 *
 * @module
 */

import type { HTTPContext, JOBContext, SOCKETContext } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidContextState,
  RapidContextType,
  RapidMiddleware,
} from '../types/mod.ts';

/**
 * Metadata key carrying a wrapped middleware's transport scope.
 * `Symbol.for` — stable across module copies (duplicated trees in
 * node_modules must agree).
 */
export const MIDDLEWARE_SCOPE: unique symbol = Symbol.for(
  'rapid.middleware.scope',
) as never;

/**
 * Read a middleware's transport scope. `undefined` = unscoped
 * (universal — it reaches every transport).
 */
export function middlewareScope(
  middleware: RapidMiddleware,
): readonly RapidContextType[] | undefined {
  return (middleware as unknown as Record<symbol, unknown>)[
    MIDDLEWARE_SCOPE
  ] as readonly RapidContextType[] | undefined;
}

/** Stamp the scope metadata onto a wrapper. */
function mark(
  wrapper: RapidMiddleware,
  scope: readonly RapidContextType[],
): RapidMiddleware {
  return Object.assign(wrapper, { [MIDDLEWARE_SCOPE]: scope });
}

/** The fail-closed rejection every guard throws off-scope. */
function failClosed(
  transport: RapidContextType,
  scope: readonly RapidContextType[],
): RapidError {
  return new RapidError('RAPID_ACCESS_DENIED', {
    message:
      `guarded middleware does not support the ${transport} transport — failing closed`,
    details: { transport, guards: [...scope] },
  });
}

type HTTPMw = (
  ctx: HTTPContext<RapidContextState>,
  next: () => Promise<void>,
) => Promise<void>;
type SOCKETMw = (
  ctx: SOCKETContext<RapidContextState>,
  next: () => Promise<void>,
) => Promise<void>;
type JOBMw = (
  ctx: JOBContext<RapidContextState>,
  next: () => Promise<void>,
) => Promise<void>;

/** Run `middleware` on HTTP; SKIP (continue) on other transports. */
export function onlyHTTP(middleware: HTTPMw): RapidMiddleware {
  return mark(async (ctx, next) => {
    if (ctx.type === 'HTTP') return await middleware(ctx, next);
    return await next();
  }, ['HTTP']);
}

/** Run `middleware` on SOCKET; SKIP (continue) on other transports. */
export function onlySOCKET(middleware: SOCKETMw): RapidMiddleware {
  return mark(async (ctx, next) => {
    if (ctx.type === 'SOCKET') return await middleware(ctx, next);
    return await next();
  }, ['SOCKET']);
}

/** Run `middleware` on JOB; SKIP (continue) on other transports. */
export function onlyJOB(middleware: JOBMw): RapidMiddleware {
  return mark(async (ctx, next) => {
    if (ctx.type === 'JOB') return await middleware(ctx, next);
    return await next();
  }, ['JOB']);
}

/**
 * Run `middleware` on HTTP; REJECT every other transport (fail-closed
 * — auth-class middleware must never be silently bypassed).
 *
 * @throws {RapidError} RAPID_ACCESS_DENIED (as a rejection of the
 *   middleware's promise) on non-HTTP transports.
 */
export function guardHTTP(middleware: HTTPMw): RapidMiddleware {
  return mark((ctx, next) => {
    if (ctx.type === 'HTTP') return middleware(ctx, next);
    return Promise.reject(failClosed(ctx.type, ['HTTP']));
  }, ['HTTP']);
}

/**
 * Run `middleware` on SOCKET; REJECT every other transport.
 *
 * @throws {RapidError} RAPID_ACCESS_DENIED (as a rejection) on
 *   non-SOCKET transports.
 */
export function guardSOCKET(middleware: SOCKETMw): RapidMiddleware {
  return mark((ctx, next) => {
    if (ctx.type === 'SOCKET') return middleware(ctx, next);
    return Promise.reject(failClosed(ctx.type, ['SOCKET']));
  }, ['SOCKET']);
}

/**
 * Run `middleware` on JOB; REJECT every other transport.
 *
 * @throws {RapidError} RAPID_ACCESS_DENIED (as a rejection) on
 *   non-JOB transports.
 */
export function guardJOB(middleware: JOBMw): RapidMiddleware {
  return mark((ctx, next) => {
    if (ctx.type === 'JOB') return middleware(ctx, next);
    return Promise.reject(failClosed(ctx.type, ['JOB']));
  }, ['JOB']);
}

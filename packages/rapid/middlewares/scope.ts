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

/**
 * Stamp the scope metadata onto a wrapper — and carry forward every
 * `rapid.middleware.*` metadata symbol already stamped on the middleware
 * being wrapped (e.g. `MIDDLEWARE_STATE_KEY`, see `stateKeyGuard.ts`).
 * The wrapper is a NEW closure, not the original function, so without
 * this copy every boot-time check that reads a middleware's own-symbol
 * metadata (`Application.__middleware.find(...)`) silently stops seeing
 * it the moment the middleware is wrapped by `only*`/`guard*` — exactly
 * the composition the framework documents as the normal way to scope a
 * universal middleware to one transport.
 */
function mark(
  wrapper: RapidMiddleware,
  wrapped: RapidMiddleware,
  scope: readonly RapidContextType[],
): RapidMiddleware {
  for (const sym of Object.getOwnPropertySymbols(wrapped)) {
    Object.assign(wrapper, {
      [sym]: (wrapped as unknown as Record<symbol, unknown>)[sym],
    });
  }
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
  return mark(
    async (ctx, next) => {
      if (ctx.type === 'HTTP') return await middleware(ctx, next);
      return await next();
    },
    middleware as unknown as RapidMiddleware,
    ['HTTP'],
  );
}

/** Run `middleware` on SOCKET; SKIP (continue) on other transports. */
export function onlySOCKET(middleware: SOCKETMw): RapidMiddleware {
  return mark(
    async (ctx, next) => {
      if (ctx.type === 'SOCKET') return await middleware(ctx, next);
      return await next();
    },
    middleware as unknown as RapidMiddleware,
    ['SOCKET'],
  );
}

/** Run `middleware` on JOB; SKIP (continue) on other transports. */
export function onlyJOB(middleware: JOBMw): RapidMiddleware {
  return mark(
    async (ctx, next) => {
      if (ctx.type === 'JOB') return await middleware(ctx, next);
      return await next();
    },
    middleware as unknown as RapidMiddleware,
    ['JOB'],
  );
}

/**
 * Run `middleware` on HTTP; REJECT every other transport (fail-closed
 * — auth-class middleware must never be silently bypassed).
 *
 * @throws {RapidError} RAPID_ACCESS_DENIED (as a rejection of the
 *   middleware's promise) on non-HTTP transports.
 */
export function guardHTTP(middleware: HTTPMw): RapidMiddleware {
  return mark(
    (ctx, next) => {
      if (ctx.type === 'HTTP') return middleware(ctx, next);
      return Promise.reject(failClosed(ctx.type, ['HTTP']));
    },
    middleware as unknown as RapidMiddleware,
    ['HTTP'],
  );
}

/**
 * Run `middleware` on SOCKET; REJECT every other transport.
 *
 * @throws {RapidError} RAPID_ACCESS_DENIED (as a rejection) on
 *   non-SOCKET transports.
 */
export function guardSOCKET(middleware: SOCKETMw): RapidMiddleware {
  return mark(
    (ctx, next) => {
      if (ctx.type === 'SOCKET') return middleware(ctx, next);
      return Promise.reject(failClosed(ctx.type, ['SOCKET']));
    },
    middleware as unknown as RapidMiddleware,
    ['SOCKET'],
  );
}

/**
 * Run `middleware` on JOB; REJECT every other transport.
 *
 * @throws {RapidError} RAPID_ACCESS_DENIED (as a rejection) on
 *   non-JOB transports.
 */
export function guardJOB(middleware: JOBMw): RapidMiddleware {
  return mark(
    (ctx, next) => {
      if (ctx.type === 'JOB') return middleware(ctx, next);
      return Promise.reject(failClosed(ctx.type, ['JOB']));
    },
    middleware as unknown as RapidMiddleware,
    ['JOB'],
  );
}

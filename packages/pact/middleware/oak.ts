/**
 * @fileoverview Oak middleware for pact. Written against structural
 * types — the package does not depend on oak; the real oak `Context`
 * satisfies {@link PactOakContext} as-is.
 *
 * @module
 */
import type { Pact } from '../Pact.ts';
import type { PactAuthContext, PermissionBits } from '../types/mod.ts';
import type { PactMiddlewareOptions } from './types/mod.ts';
import {
  extractCredential,
  failureResponse,
  NO_CREDENTIALS,
} from './shared.ts';

/** The slice of an oak context the middleware reads and writes. */
export type PactOakContext<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  request: {
    method: string;
    url: { pathname: string };
    headers: { get: (name: string) => string | null };
  };
  response: { status: number; body: unknown };
  state: {
    /** Attached by {@link oakAuth} on successful authentication. */
    pact?: PactAuthContext<M, B>;
  };
};

function requestView(ctx: PactOakContext): {
  method: string;
  path: string;
  header: (name: string) => string | null;
} {
  return {
    method: ctx.request.method,
    path: ctx.request.url.pathname,
    header: (name) => ctx.request.headers.get(name),
  };
}

/**
 * Authentication middleware: extracts the credential, calls
 * `pact.authenticate`, and attaches the auth context as
 * `ctx.state.pact`. Responds 401 itself on a missing or invalid
 * credential (unless `options.optional`); non-pact errors are rethrown
 * to oak.
 *
 * @example
 * ```ts ignore
 * app.use(oakAuth(pact));
 * router.get('/projects', oakGuard('Projects', 'READ'), (ctx) => {
 *   ctx.response.body = { user: ctx.state.pact.principal.id };
 * });
 * ```
 */
export function oakAuth<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): (
  ctx: PactOakContext<M, B>,
  next: () => Promise<unknown>,
) => Promise<void> {
  return async (ctx, next) => {
    const credential = extractCredential(requestView(ctx), options);
    if (credential === null) {
      if (options?.optional === true) {
        await next();
        return;
      }
      ctx.response.status = NO_CREDENTIALS.status;
      ctx.response.body = NO_CREDENTIALS.body;
      return;
    }
    try {
      ctx.state.pact = await pact.authenticate(credential);
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) throw error;
      ctx.response.status = failure.status;
      ctx.response.body = failure.body;
      return;
    }
    await next();
  };
}

/**
 * Permission guard: requires a request authenticated by {@link oakAuth}
 * whose principal holds `permission` in `module`. Responds 401 when
 * unauthenticated and 403 when denied.
 */
export function oakGuard(
  module: string,
  permission: string,
): (
  ctx: PactOakContext,
  next: () => Promise<unknown>,
) => Promise<void> {
  return async (ctx, next) => {
    const auth = ctx.state.pact;
    if (auth === undefined) {
      ctx.response.status = NO_CREDENTIALS.status;
      ctx.response.body = NO_CREDENTIALS.body;
      return;
    }
    try {
      await auth.principal.assert(module, permission);
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) throw error;
      ctx.response.status = failure.status;
      ctx.response.body = failure.body;
      return;
    }
    await next();
  };
}

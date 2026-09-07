/**
 * @fileoverview Oak middleware for pact. Written against structural
 * types — the package does not depend on oak; the real oak `Context`
 * satisfies {@link PactOakContext} as-is.
 *
 * @module
 */
import type { Pact } from '../Pact.ts';
import type { PactAuthContext, PermissionBits } from '../types/mod.ts';
import type {
  PactMiddlewareDenial,
  PactMiddlewareOptions,
} from './types/mod.ts';
import { createPactMiddleware } from './core.ts';

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
  response: {
    status: number;
    body: unknown;
    /** oak's `Headers`; the challenge lands here when present. */
    headers?: { set: (name: string, value: string) => unknown };
  };
  state: {
    /** Attached by `authenticate` on successful authentication. */
    pact?: PactAuthContext<M, B>;
  };
};

/** An oak middleware. */
export type PactOakMiddleware<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = (ctx: PactOakContext<M, B>, next: () => Promise<unknown>) => Promise<void>;

function send(ctx: PactOakContext, denial: PactMiddlewareDenial): void {
  ctx.response.status = denial.status;
  ctx.response.body = denial.body;
  for (const [name, value] of Object.entries(denial.headers)) {
    ctx.response.headers?.set(name, value);
  }
}

/**
 * Build the two oak middlewares over one pact instance: `authenticate`
 * extracts the credential, calls `pact.authenticate`, and attaches the
 * auth context as `ctx.state.pact` (401 on a missing credential unless
 * `optional`, 401 on an invalid one always, non-pact errors rethrown to
 * oak); `authorize(module, permission)` — typed by the instance — asserts
 * on the attached bound principal (401 unauthenticated, 403 denied).
 *
 * @example
 * ```ts ignore
 * const { authenticate, authorize } = oakPact(pact);
 * app.use(authenticate);
 * router.get('/projects', authorize('Projects', 'READ'), (ctx) => {
 *   ctx.response.body = { user: ctx.state.pact.principal.id };
 * });
 * ```
 */
export function oakPact<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): {
  authenticate: PactOakMiddleware<M, B>;
  authorize: (
    module: M,
    permission: keyof B & string,
  ) => PactOakMiddleware<M, B>;
} {
  const core = createPactMiddleware(pact, options);
  return {
    authenticate: async (ctx, next) => {
      const verdict = await core.authenticate({
        method: ctx.request.method,
        path: ctx.request.url.pathname,
        header: (name) => ctx.request.headers.get(name),
      });
      if (!verdict.ok) return send(ctx, verdict.denial);
      if (verdict.auth !== undefined) ctx.state.pact = verdict.auth;
      await next();
    },
    authorize: (module, permission) => {
      const guard = core.authorize(module, permission);
      return async (ctx, next) => {
        const denial = await guard(ctx.state.pact);
        if (denial !== undefined) return send(ctx, denial);
        await next();
      };
    },
  };
}

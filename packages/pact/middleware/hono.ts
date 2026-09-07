/**
 * @fileoverview Hono middleware for pact (Workers/edge friendly).
 * Written against structural types — the package does not depend on
 * hono. Read the attached context in handlers with `c.get('pact')`.
 *
 * @module
 */
import type { Pact } from '../Pact.ts';
import type { PermissionBits } from '../types/mod.ts';
import type { PactMiddlewareOptions } from './types/mod.ts';
import { createPactMiddleware } from './core.ts';

/** The slice of a hono context the middleware reads and writes. */
export type PactHonoContext = {
  req: {
    method: string;
    path: string;
    header: (name: string) => string | undefined;
  };
  /** hono's `c.json(body, status, headers)`. */
  json: (
    body: unknown,
    status?: number,
    headers?: Record<string, string>,
  ) => Response;
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
};

/** A hono middleware. */
export type PactHonoMiddleware = (
  c: PactHonoContext,
  next: () => Promise<void>,
) => Promise<Response | void>;

/**
 * Build the two hono middlewares over one pact instance: `authenticate`
 * extracts the credential, calls `pact.authenticate`, and attaches the
 * auth context via `c.set('pact', …)` (401 on a missing credential
 * unless `optional`, 401 on an invalid one always, non-pact errors
 * rethrown to hono); `authorize(module, permission)` — typed by the
 * instance — asserts on the attached bound principal (401
 * unauthenticated, 403 denied).
 *
 * @example
 * ```ts ignore
 * const { authenticate, authorize } = honoPact(pact);
 * app.use(authenticate);
 * app.get('/projects', authorize('Projects', 'READ'), (c) => {
 *   const auth = c.get('pact') as PactAuthContext;
 *   return c.json({ user: auth.principal.id });
 * });
 * ```
 */
export function honoPact<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): {
  authenticate: PactHonoMiddleware;
  authorize: (module: M, permission: keyof B & string) => PactHonoMiddleware;
} {
  const core = createPactMiddleware(pact, options);
  return {
    authenticate: async (c, next) => {
      const verdict = await core.authenticate({
        method: c.req.method,
        path: c.req.path,
        header: (name) => c.req.header(name) ?? null,
      });
      if (!verdict.ok) {
        const { status, body, headers } = verdict.denial;
        return c.json(body, status, { ...headers });
      }
      if (verdict.auth !== undefined) c.set('pact', verdict.auth);
      await next();
    },
    authorize: (module, permission) => {
      const guard = core.authorize(module, permission);
      return async (c, next) => {
        const denial = await guard(
          c.get('pact') as Parameters<typeof guard>[0],
        );
        if (denial !== undefined) {
          return c.json(denial.body, denial.status, { ...denial.headers });
        }
        await next();
      };
    },
  };
}

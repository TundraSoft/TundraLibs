/**
 * @fileoverview Express (and Connect-compatible) middleware for pact.
 * Written against structural types — the package does not depend on
 * express; any object shaped like an express request/response works.
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

/** The slice of an express request the middleware reads and writes. */
export type PactExpressRequest<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  method: string;
  url: string;
  /** Express provides `path` (no query string); plain Connect may not. */
  path?: string;
  headers: Record<string, string | string[] | undefined>;
  /** Attached by `authenticate` on successful authentication. */
  pact?: PactAuthContext<M, B>;
};

/** The slice of an express response the middleware writes. */
export type PactExpressResponse = {
  status: (code: number) => { json: (body: unknown) => unknown };
  /** Express's `res.setHeader`; the challenge lands here when present. */
  setHeader?: (name: string, value: string) => unknown;
};

/** An express middleware. */
export type PactExpressMiddleware<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = (
  req: PactExpressRequest<M, B>,
  res: PactExpressResponse,
  next: (error?: unknown) => void,
) => Promise<void>;

function headerOf(req: PactExpressRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (value === undefined) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function send(res: PactExpressResponse, denial: PactMiddlewareDenial): void {
  for (const [name, value] of Object.entries(denial.headers)) {
    res.setHeader?.(name, value);
  }
  res.status(denial.status).json(denial.body);
}

/**
 * Build the two express middlewares over one pact instance:
 * `authenticate` extracts the credential, calls `pact.authenticate`, and
 * attaches the auth context as `req.pact` (401 on a missing credential
 * unless `optional`, 401 on an invalid one always, non-pact errors go to
 * `next(error)`); `authorize(module, permission)` — typed by the
 * instance — asserts on the attached bound principal (401
 * unauthenticated, 403 denied).
 *
 * @example
 * ```ts ignore
 * const { authenticate, authorize } = expressPact(pact);
 * app.use(authenticate);
 * app.get('/projects', authorize('Projects', 'READ'), (req, res) => {
 *   res.json({ user: req.pact.principal.id });
 * });
 * ```
 */
export function expressPact<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): {
  authenticate: PactExpressMiddleware<M, B>;
  authorize: (
    module: M,
    permission: keyof B & string,
  ) => PactExpressMiddleware<M, B>;
} {
  const core = createPactMiddleware(pact, options);
  return {
    authenticate: async (req, res, next) => {
      let verdict: Awaited<ReturnType<typeof core.authenticate>>;
      try {
        verdict = await core.authenticate({
          method: req.method,
          path: req.path ?? req.url.split('?', 2)[0] ?? req.url,
          header: (name) => headerOf(req, name),
        });
      } catch (error) {
        return next(error);
      }
      if (!verdict.ok) return send(res, verdict.denial);
      if (verdict.auth !== undefined) req.pact = verdict.auth;
      next();
    },
    authorize: (module, permission) => {
      const guard = core.authorize(module, permission);
      return async (req, res, next) => {
        let denial: PactMiddlewareDenial | undefined;
        try {
          denial = await guard(req.pact);
        } catch (error) {
          return next(error);
        }
        if (denial !== undefined) return send(res, denial);
        next();
      };
    },
  };
}

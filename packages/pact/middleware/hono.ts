/**
 * @fileoverview Hono middleware for pact (Workers/edge friendly).
 * Written against structural types — the package does not depend on
 * hono. Read the attached context in handlers with `c.get('pact')`.
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

/** The slice of a hono context the middleware reads and writes. */
export type PactHonoContext = {
  req: {
    method: string;
    path: string;
    header: (name: string) => string | undefined;
  };
  json: (body: unknown, status?: number) => Response;
  set: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
};

function requestView(c: PactHonoContext): {
  method: string;
  path: string;
  header: (name: string) => string | null;
} {
  return {
    method: c.req.method,
    path: c.req.path,
    header: (name) => c.req.header(name) ?? null,
  };
}

/**
 * Authentication middleware: extracts the credential, calls
 * `pact.authenticate`, and attaches the auth context via
 * `c.set('pact', ...)`. Returns a 401 response itself on a missing or
 * invalid credential (unless `options.optional`); non-pact errors are
 * rethrown to hono.
 *
 * @example
 * ```ts ignore
 * app.use(honoAuth(pact));
 * app.get('/projects', honoGuard('Projects', 'READ'), (c) => {
 *   const auth = c.get('pact') as PactAuthContext;
 *   return c.json({ user: auth.principal.id });
 * });
 * ```
 */
export function honoAuth<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): (
  c: PactHonoContext,
  next: () => Promise<void>,
) => Promise<Response | void> {
  return async (c, next) => {
    const credential = extractCredential(requestView(c), options);
    if (credential === null) {
      if (options?.optional === true) return await next();
      return c.json(NO_CREDENTIALS.body, NO_CREDENTIALS.status);
    }
    try {
      c.set('pact', await pact.authenticate(credential));
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) throw error;
      return c.json(failure.body, failure.status);
    }
    await next();
  };
}

/**
 * Permission guard: requires a request authenticated by {@link honoAuth}
 * whose principal holds `permission` in `module`. Returns 401 when
 * unauthenticated and 403 when denied.
 */
export function honoGuard(
  module: string,
  permission: string,
): (
  c: PactHonoContext,
  next: () => Promise<void>,
) => Promise<Response | void> {
  return async (c, next) => {
    const auth = c.get('pact') as PactAuthContext | undefined;
    if (auth === undefined) {
      return c.json(NO_CREDENTIALS.body, NO_CREDENTIALS.status);
    }
    try {
      await auth.principal.assert(module, permission);
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) throw error;
      return c.json(failure.body, failure.status);
    }
    await next();
  };
}

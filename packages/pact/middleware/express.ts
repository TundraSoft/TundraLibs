/**
 * @fileoverview Express (and Connect-compatible) middleware for pact.
 * Written against structural types — the package does not depend on
 * express; any object shaped like an express request/response works.
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
  /** Attached by {@link expressAuth} on successful authentication. */
  pact?: PactAuthContext<M, B>;
};

/** The slice of an express response the middleware writes. */
export type PactExpressResponse = {
  status: (code: number) => { json: (body: unknown) => unknown };
};

function headerOf(req: PactExpressRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (value === undefined) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function requestView(req: PactExpressRequest): {
  method: string;
  path: string;
  header: (name: string) => string | null;
} {
  return {
    method: req.method,
    path: req.path ?? req.url.split('?', 2)[0] ?? req.url,
    header: (name) => headerOf(req, name),
  };
}

/**
 * Authentication middleware: extracts the credential, calls
 * `pact.authenticate`, and attaches the auth context as `req.pact`.
 * Responds 401 itself on a missing or invalid credential (unless
 * `options.optional`); non-pact errors go to `next(error)`.
 *
 * @example
 * ```ts ignore
 * app.use(expressAuth(pact));
 * app.get('/projects', expressGuard('Projects', 'READ'), (req, res) => {
 *   res.json({ user: req.pact.principal.id });
 * });
 * ```
 */
export function expressAuth<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): (
  req: PactExpressRequest<M, B>,
  res: PactExpressResponse,
  next: (error?: unknown) => void,
) => Promise<void> {
  return async (req, res, next) => {
    const credential = extractCredential(requestView(req), options);
    if (credential === null) {
      if (options?.optional === true) return next();
      res.status(NO_CREDENTIALS.status).json(NO_CREDENTIALS.body);
      return;
    }
    try {
      req.pact = await pact.authenticate(credential);
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) return next(error);
      res.status(failure.status).json(failure.body);
      return;
    }
    next();
  };
}

/**
 * Permission guard: requires a request authenticated by
 * {@link expressAuth} whose principal holds `permission` in `module`.
 * Responds 401 when unauthenticated and 403 when denied.
 */
export function expressGuard(
  module: string,
  permission: string,
): (
  req: PactExpressRequest,
  res: PactExpressResponse,
  next: (error?: unknown) => void,
) => Promise<void> {
  return async (req, res, next) => {
    const ctx = req.pact;
    if (ctx === undefined) {
      res.status(NO_CREDENTIALS.status).json(NO_CREDENTIALS.body);
      return;
    }
    try {
      await ctx.principal.assert(module, permission);
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) return next(error);
      res.status(failure.status).json(failure.body);
      return;
    }
    next();
  };
}

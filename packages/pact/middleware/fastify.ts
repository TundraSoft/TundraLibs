/**
 * @fileoverview Fastify hook adapters for pact. Written against
 * structural types — the package does not depend on fastify. Register
 * globally with `app.addHook('preHandler', fastifyAuth(pact))` or
 * per-route via the route's `preHandler` array.
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

/** The slice of a fastify request the hook reads and writes. */
export type PactFastifyRequest<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  method: string;
  /** Fastify's `url` includes the query string. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  /** Attached by {@link fastifyAuth} on successful authentication. */
  pact?: PactAuthContext<M, B>;
};

/** The slice of a fastify reply the hook writes. */
export type PactFastifyReply = {
  code: (status: number) => { send: (body: unknown) => unknown };
};

function requestView(req: PactFastifyRequest): {
  method: string;
  path: string;
  header: (name: string) => string | null;
} {
  return {
    method: req.method,
    path: req.url.split('?', 2)[0] ?? req.url,
    header: (name) => {
      const value = req.headers[name.toLowerCase()];
      if (value === undefined) return null;
      return Array.isArray(value) ? value[0] ?? null : value;
    },
  };
}

/**
 * Authentication preHandler hook: extracts the credential, calls
 * `pact.authenticate`, and attaches the auth context as `request.pact`.
 * Sends 401 itself on a missing or invalid credential (unless
 * `options.optional`); non-pact errors are rethrown to fastify.
 *
 * @example
 * ```ts ignore
 * app.addHook('preHandler', fastifyAuth(pact));
 * app.get('/projects', {
 *   preHandler: fastifyGuard('Projects', 'READ'),
 * }, (request) => ({ user: request.pact.principal.id }));
 * ```
 */
export function fastifyAuth<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): (
  request: PactFastifyRequest<M, B>,
  reply: PactFastifyReply,
) => Promise<void> {
  return async (request, reply) => {
    const credential = extractCredential(requestView(request), options);
    if (credential === null) {
      if (options?.optional === true) return;
      reply.code(NO_CREDENTIALS.status).send(NO_CREDENTIALS.body);
      return;
    }
    try {
      request.pact = await pact.authenticate(credential);
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) throw error;
      reply.code(failure.status).send(failure.body);
    }
  };
}

/**
 * Permission guard hook: requires a request authenticated by
 * {@link fastifyAuth} whose principal holds `permission` in `module`.
 * Sends 401 when unauthenticated and 403 when denied.
 */
export function fastifyGuard(
  module: string,
  permission: string,
): (
  request: PactFastifyRequest,
  reply: PactFastifyReply,
) => Promise<void> {
  return async (request, reply) => {
    const ctx = request.pact;
    if (ctx === undefined) {
      reply.code(NO_CREDENTIALS.status).send(NO_CREDENTIALS.body);
      return;
    }
    try {
      await ctx.principal.assert(module, permission);
    } catch (error) {
      const failure = failureResponse(error);
      if (failure === null) throw error;
      reply.code(failure.status).send(failure.body);
    }
  };
}

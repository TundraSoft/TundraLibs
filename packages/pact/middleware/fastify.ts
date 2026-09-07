/**
 * @fileoverview Fastify hooks for pact (`preHandler`-shaped). Written
 * against structural types — the package does not depend on fastify.
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

/** The slice of a fastify request the hook reads and writes. */
export type PactFastifyRequest<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  method: string;
  /** Fastify's `url` includes the query string. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  /** Attached by `authenticate` on successful authentication. */
  pact?: PactAuthContext<M, B>;
};

/** The slice of a fastify reply the hook writes. */
export type PactFastifyReply = {
  code: (status: number) => { send: (body: unknown) => unknown };
  /** Fastify's `reply.header`; the challenge lands here when present. */
  header?: (name: string, value: string) => unknown;
};

/** A fastify `preHandler` hook (async form — resolve to continue). */
export type PactFastifyHook<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = (
  request: PactFastifyRequest<M, B>,
  reply: PactFastifyReply,
) => Promise<void>;

function send(reply: PactFastifyReply, denial: PactMiddlewareDenial): void {
  for (const [name, value] of Object.entries(denial.headers)) {
    reply.header?.(name, value);
  }
  reply.code(denial.status).send(denial.body);
}

/**
 * Build the two fastify hooks over one pact instance: `authenticate`
 * extracts the credential, calls `pact.authenticate`, and attaches the
 * auth context as `request.pact` (401 on a missing credential unless
 * `optional`, 401 on an invalid one always, non-pact errors rethrown to
 * fastify); `authorize(module, permission)` — typed by the instance —
 * asserts on the attached bound principal (401 unauthenticated, 403
 * denied). Both are async `preHandler` hooks: a sent reply ends the
 * request, a resolved hook continues it.
 *
 * @example
 * ```ts ignore
 * const { authenticate, authorize } = fastifyPact(pact);
 * app.addHook('preHandler', authenticate); // global
 * app.get('/projects', {
 *   preHandler: authorize('Projects', 'READ'), // per-route
 * }, async (request) => ({ user: request.pact.principal.id }));
 * ```
 */
export function fastifyPact<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): {
  authenticate: PactFastifyHook<M, B>;
  authorize: (module: M, permission: keyof B & string) => PactFastifyHook<M, B>;
} {
  const core = createPactMiddleware(pact, options);
  return {
    authenticate: async (request, reply) => {
      const verdict = await core.authenticate({
        method: request.method,
        path: request.url.split('?', 2)[0] ?? request.url,
        header: (name) => {
          const value = request.headers[name.toLowerCase()];
          if (value === undefined) return null;
          return Array.isArray(value) ? value[0] ?? null : value;
        },
      });
      if (!verdict.ok) return send(reply, verdict.denial);
      if (verdict.auth !== undefined) request.pact = verdict.auth;
    },
    authorize: (module, permission) => {
      const guard = core.authorize(module, permission);
      return async (request, reply) => {
        const denial = await guard(request.pact);
        if (denial !== undefined) send(reply, denial);
      };
    },
  };
}

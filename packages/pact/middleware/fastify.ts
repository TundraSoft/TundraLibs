/**
 * @fileoverview Fastify hooks for pact (`preHandler`-shaped, plus an
 * `onSend` hook for signed/encrypted responses). Written against
 * structural types — the package does not depend on fastify.
 *
 * @module
 */
import type { Pact } from '../Pact.ts';
import type { PactAuthContext, PermissionBits } from '../types/mod.ts';
import type {
  PactMiddlewareDenial,
  PactMiddlewareOptions,
  PactMiddlewareResponder,
} from './types/mod.ts';
import { createPactMiddleware } from './core.ts';

/** The slice of a fastify request the hooks read and write. */
export type PactFastifyRequest<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  method: string;
  /** Fastify's `url` includes the query string. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  /** `http` or `https`; fastify's `request.protocol`. */
  protocol?: string;
  /**
   * The raw body for digests and decryption: `rawBody` when a content
   * type parser kept it, else `body` when it is a string or bytes.
   */
  rawBody?: Uint8Array | string;
  body?: unknown;
  /** Attached by `authenticate` on successful authentication. */
  pact?: PactAuthContext<M, B>;
  /** The decrypted request payload, when one arrived encrypted. */
  pactBody?: Uint8Array;
  /** Set by `authenticate` for `respond` to pick up. */
  pactRespond?: PactMiddlewareResponder;
};

/** The slice of a fastify reply the hooks write. */
export type PactFastifyReply = {
  code: (status: number) => { send: (body: unknown) => unknown };
  /** Fastify's `reply.header`; the challenge and signature land here. */
  header?: (name: string, value: string) => unknown;
  /** Read by `respond` for `${@status}`. */
  statusCode?: number;
};

/** A fastify `preHandler` hook (async form — resolve to continue). */
export type PactFastifyHook<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = (
  request: PactFastifyRequest<M, B>,
  reply: PactFastifyReply,
) => Promise<void>;

/** A fastify `onSend` hook (async form — resolve to the payload to send). */
export type PactFastifyOnSend<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = (
  request: PactFastifyRequest<M, B>,
  reply: PactFastifyReply,
  payload: unknown,
) => Promise<unknown>;

function send(reply: PactFastifyReply, denial: PactMiddlewareDenial): void {
  for (const [name, value] of Object.entries(denial.headers)) {
    reply.header?.(name, value);
  }
  reply.code(denial.status).send(denial.body);
}

function headerOf(request: PactFastifyRequest, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(', ') : value;
}

/** The serialized payload `onSend` sees, or `undefined` for a stream. */
function finished(payload: unknown): Uint8Array | string | null | undefined {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === 'string' || payload instanceof Uint8Array) {
    return payload;
  }
  return undefined;
}

function rawBodyOf(request: PactFastifyRequest): Uint8Array | string | null {
  const raw = request.rawBody ?? request.body;
  return typeof raw === 'string' || raw instanceof Uint8Array ? raw : null;
}

/** Path and raw query (with `?`) of a request target. */
function splitTarget(target: string): [string, string] {
  const at = target.indexOf('?');
  return at === -1 ? [target, ''] : [target.slice(0, at), target.slice(at)];
}

/**
 * Build the fastify hooks over one pact instance: `authenticate` extracts
 * the credential, calls `pact.authenticate`, and attaches the auth
 * context as `request.pact` (401 on a missing credential unless
 * `optional`, 401 on an invalid one always, non-pact errors rethrown to
 * fastify); `authorize(module, permission)` — typed by the instance —
 * asserts on the attached bound principal (401 unauthenticated, 403
 * denied). Both are async `preHandler` hooks: a sent reply ends the
 * request, a resolved hook continues it. `respond` is an `onSend` hook
 * that signs/encrypts the serialized payload for the callers
 * `authenticate` marked — register it once, globally; everything else,
 * streams included, passes through untouched.
 *
 * @example
 * ```ts ignore
 * const { authenticate, authorize, respond } = fastifyPact(pact);
 * app.addHook('preHandler', authenticate); // global
 * app.addHook('onSend', respond); // only acts on signed/encrypted callers
 * app.get('/projects', {
 *   preHandler: authorize('Projects', 'READ'), // per-route
 * }, async (request) => ({ user: request.pact.principal.id }));
 * ```
 *
 * @throws {PactError} INVALID_OPTION for a malformed option at build;
 *   UNKNOWN_MODULE / PERMISSION_NOT_IN_MODULE from `authorize()` at the
 *   call site.
 */
export function fastifyPact<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options?: PactMiddlewareOptions,
): {
  authenticate: PactFastifyHook<M, B>;
  authorize: (module: M, permission: keyof B & string) => PactFastifyHook<M, B>;
  respond: PactFastifyOnSend<M, B>;
} {
  const core = createPactMiddleware(pact, options);
  return {
    authenticate: async (request, reply) => {
      const [path, query] = splitTarget(request.url);
      const verdict = await core.authenticate({
        method: request.method,
        path,
        query,
        authority: headerOf(request, 'host') ?? undefined,
        scheme: request.protocol,
        header: (name) => headerOf(request, name),
        body: () => Promise.resolve(rawBodyOf(request)),
      });
      if (!verdict.ok) return send(reply, verdict.denial);
      if (verdict.auth !== undefined) request.pact = verdict.auth;
      if (verdict.body !== undefined) request.pactBody = verdict.body;
      if (verdict.respond !== undefined) request.pactRespond = verdict.respond;
    },
    authorize: (module, permission) => {
      const guard = core.authorize(module, permission);
      return async (request, reply) => {
        const denial = await guard(request.pact);
        if (denial !== undefined) send(reply, denial);
      };
    },
    respond: async (request, reply, payload) => {
      const respond = request.pactRespond;
      const sent = finished(payload);
      if (respond === undefined || sent === undefined) return payload;
      const patch = await respond({
        status: reply.statusCode ?? 200,
        body: sent,
      });
      for (const [name, value] of Object.entries(patch.headers)) {
        reply.header?.(name, value);
      }
      return patch.body ?? payload;
    },
  };
}

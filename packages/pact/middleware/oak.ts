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
  PactMiddlewareResponder,
} from './types/mod.ts';
import { createPactMiddleware } from './core.ts';

/** The slice of an oak context the middleware reads and writes. */
export type PactOakContext<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  request: {
    method: string;
    url: {
      pathname: string;
      search?: string;
      host?: string;
      protocol?: string;
    };
    headers: { get: (name: string) => string | null };
    /** oak's `Body`; read only when a body-bound feature is on. */
    body?: { has: boolean; arrayBuffer: () => Promise<ArrayBuffer> };
  };
  response: {
    status: number;
    body: unknown;
    /** oak's `Headers`; the challenge and signature land here. */
    headers?: { set: (name: string, value: string) => unknown };
    /** oak's content-type shortcut; set alongside the header. */
    type?: string;
  };
  state: {
    /** Attached by `authenticate` on successful authentication. */
    pact?: PactAuthContext<M, B>;
    /**
     * Attached when the adapter consumed the request body for a digest
     * or decryption: the decrypted payload, else the raw bytes. Read
     * the body from here on such routes — oak's stream is spent.
     */
    pactBody?: Uint8Array;
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

/** The response body as oak will send it, or `undefined` for a stream. */
function finished(body: unknown): Uint8Array | string | null | undefined {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string' || body instanceof Uint8Array) return body;
  if (
    typeof body === 'function' || body instanceof ReadableStream ||
    body instanceof Blob || body instanceof FormData ||
    Symbol.asyncIterator in (body as object)
  ) return undefined;
  return JSON.stringify(body);
}

/** Sign/encrypt the finished response in place; streams are left alone. */
async function seal(
  ctx: PactOakContext,
  respond: PactMiddlewareResponder,
): Promise<void> {
  const sent = finished(ctx.response.body);
  if (sent === undefined) return;
  const patch = await respond({ status: ctx.response.status, body: sent });
  const setType = (value: string): void => {
    ctx.response.type = value;
    ctx.response.headers?.set('content-type', value);
  };
  if (patch.body !== undefined) {
    ctx.response.body = patch.body;
  } else if (
    typeof ctx.response.body !== 'string' && typeof sent === 'string'
  ) {
    // Serialized here so the signed bytes are the sent bytes.
    ctx.response.body = sent;
    setType('application/json; charset=UTF-8');
  }
  for (const [name, value] of Object.entries(patch.headers)) {
    if (name === 'content-type') setType(value);
    else ctx.response.headers?.set(name, value);
  }
}

/**
 * Build the two oak middlewares over one pact instance: `authenticate`
 * extracts the credential, calls `pact.authenticate`, and attaches the
 * auth context as `ctx.state.pact` (401 on a missing credential unless
 * `optional`, 401 on an invalid one always, non-pact errors rethrown to
 * oak); `authorize(module, permission)` — typed by the instance — asserts
 * on the attached bound principal (401 unauthenticated, 403 denied).
 * With `hmac` or `encryption` on, `authenticate` also signs/encrypts the
 * finished response after `next()` (streamed bodies are sent as-is).
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
      let raw: Uint8Array | undefined;
      const { url, body } = ctx.request;
      const verdict = await core.authenticate({
        method: ctx.request.method,
        path: url.pathname,
        query: url.search,
        authority: url.host,
        scheme: url.protocol?.replace(/:$/, ''),
        header: (name) => ctx.request.headers.get(name),
        body: body?.has
          ? async () => raw = new Uint8Array(await body.arrayBuffer())
          : undefined,
      });
      if (!verdict.ok) return send(ctx, verdict.denial);
      if (verdict.auth !== undefined) ctx.state.pact = verdict.auth;
      const consumed = verdict.body ?? raw;
      if (consumed !== undefined) ctx.state.pactBody = consumed;
      await next();
      if (verdict.respond !== undefined) await seal(ctx, verdict.respond);
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

/**
 * @fileoverview Hono middleware for pact (Workers/edge friendly).
 * Written against structural types — the package does not depend on
 * hono. Read the attached context in handlers with `c.get('pact')`.
 *
 * @module
 */
import type { Pact } from '../Pact.ts';
import type { PermissionBits } from '../types/mod.ts';
import type {
  PactMiddlewareOptions,
  PactMiddlewareResponder,
} from './types/mod.ts';
import { createPactMiddleware } from './core.ts';

/** The slice of a hono context the middleware reads and writes. */
export type PactHonoContext = {
  req: {
    method: string;
    path: string;
    /** The full request URL; `@query`, `@authority`, `@scheme` come from it. */
    url?: string;
    header: (name: string) => string | undefined;
    /** hono caches the body, so handlers can still read it afterwards. */
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  /** The handler's response; replaced when it is signed or encrypted. */
  res?: Response;
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

/** Replace `c.res` with its signed/encrypted form; event streams pass. */
async function seal(
  c: PactHonoContext,
  respond: PactMiddlewareResponder,
): Promise<void> {
  const res = c.res;
  if (res === undefined) return;
  if (res.headers.get('content-type')?.startsWith('text/event-stream')) return;
  const sent = res.body === null
    ? null
    : new Uint8Array(await res.arrayBuffer());
  const patch = await respond({ status: res.status, body: sent });
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries(patch.headers)) {
    headers.set(name, value);
  }
  c.res = new Response(patch.body ?? sent, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Build the two hono middlewares over one pact instance: `authenticate`
 * extracts the credential, calls `pact.authenticate`, and attaches the
 * auth context via `c.set('pact', …)` (401 on a missing credential
 * unless `optional`, 401 on an invalid one always, non-pact errors
 * rethrown to hono); `authorize(module, permission)` — typed by the
 * instance — asserts on the attached bound principal (401
 * unauthenticated, 403 denied). With `hmac` or `encryption` on,
 * `authenticate` also signs/encrypts `c.res` after `next()` (an
 * `text/event-stream` response is sent as-is) and exposes a decrypted
 * request payload as `c.get('pactBody')`.
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
      const url = c.req.url === undefined ? undefined : new URL(c.req.url);
      const read = c.req.arrayBuffer;
      const verdict = await core.authenticate({
        method: c.req.method,
        path: c.req.path,
        query: url?.search,
        authority: url?.host,
        scheme: url?.protocol.replace(/:$/, ''),
        header: (name) => c.req.header(name) ?? null,
        body: read === undefined
          ? undefined
          : async () => new Uint8Array(await read.call(c.req)),
      });
      if (!verdict.ok) {
        const { status, body, headers } = verdict.denial;
        return c.json(body, status, { ...headers });
      }
      if (verdict.auth !== undefined) c.set('pact', verdict.auth);
      if (verdict.body !== undefined) c.set('pactBody', verdict.body);
      await next();
      if (verdict.respond !== undefined) await seal(c, verdict.respond);
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

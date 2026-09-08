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
  PactMiddlewareResponder,
} from './types/mod.ts';
import { createPactMiddleware } from './core.ts';

/** The slice of an express request the middleware reads and writes. */
export type PactExpressRequest<
  M extends string = string,
  B extends PermissionBits = PermissionBits,
> = {
  method: string;
  /** Mount-relative inside `app.use('/prefix', …)`; see `originalUrl`. */
  url: string;
  /**
   * The full request target as received. Preferred for the signed
   * `${@path}`/`${@query}` — `url` and `path` are relative to the mount.
   */
  originalUrl?: string;
  /** `http` or `https`; express's `req.protocol`. */
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
  /**
   * The raw body for digests and decryption: `rawBody` when your body
   * parser kept it (`express.json({ verify })`), else `body` when it is
   * a string or bytes (`express.text()`, `express.raw()`).
   */
  rawBody?: Uint8Array | string;
  body?: unknown;
  /** Attached by `authenticate` on successful authentication. */
  pact?: PactAuthContext<M, B>;
  /** The decrypted request payload, when one arrived encrypted. */
  pactBody?: Uint8Array;
};

/** The slice of an express response the middleware writes. */
export type PactExpressResponse = {
  status: (code: number) => { json: (body: unknown) => unknown };
  /** Express's `res.setHeader`; the challenge and signature land here. */
  setHeader?: (name: string, value: string) => unknown;
  /** Wrapped by `authenticate` when the response must be signed/encrypted. */
  json?: (body: unknown) => unknown;
  send?: (body: unknown) => unknown;
  statusCode?: number;
  headersSent?: boolean;
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
  return Array.isArray(value) ? value.join(', ') : value;
}

function rawBodyOf(req: PactExpressRequest): Uint8Array | string | null {
  const raw = req.rawBody ?? req.body;
  return typeof raw === 'string' || raw instanceof Uint8Array ? raw : null;
}

/** Path and raw query (with `?`) of a request target. */
function splitTarget(target: string): [string, string] {
  const at = target.indexOf('?');
  return at === -1 ? [target, ''] : [target.slice(0, at), target.slice(at)];
}

function send(res: PactExpressResponse, denial: PactMiddlewareDenial): void {
  for (const [name, value] of Object.entries(denial.headers)) {
    res.setHeader?.(name, value);
  }
  res.status(denial.status).json(denial.body);
}

/**
 * Replace `res.json` so the JSON the handler sends is sealed first. The
 * write happens once `respond()` settles, so `res.json` returns before
 * the bytes leave; a response already sent by then is left alone.
 */
function wrapJson(
  res: PactExpressResponse,
  respond: PactMiddlewareResponder,
  next: (error?: unknown) => void,
): void {
  const raw = res.send;
  if (raw === undefined) return;
  res.json = (body: unknown) => {
    const text = JSON.stringify(body);
    respond({ status: res.statusCode ?? 200, body: text })
      .then((patch) => {
        if (res.headersSent === true) return;
        res.setHeader?.(
          'content-type',
          patch.headers['content-type'] ?? 'application/json; charset=utf-8',
        );
        for (const [name, value] of Object.entries(patch.headers)) {
          res.setHeader?.(name, value);
        }
        raw.call(res, patch.body ?? text);
      })
      .catch(next);
    return res;
  };
}

/**
 * Build the two express middlewares over one pact instance:
 * `authenticate` extracts the credential, calls `pact.authenticate`, and
 * attaches the auth context as `req.pact` (401 on a missing credential
 * unless `optional`, 401 on an invalid one always, non-pact errors go to
 * `next(error)`); `authorize(module, permission)` — typed by the
 * instance — asserts on the attached bound principal (401
 * unauthenticated, 403 denied). When a response must be signed or
 * encrypted, `authenticate` wraps `res.json` so the JSON the handler
 * sends is sealed (plain `JSON.stringify`; other send paths go out
 * as-is) and exposes a decrypted request payload as `req.pactBody`.
 *
 * @example
 * ```ts ignore
 * const { authenticate, authorize } = expressPact(pact);
 * app.use(authenticate);
 * app.get('/projects', authorize('Projects', 'READ'), (req, res) => {
 *   res.json({ user: req.pact.principal.id });
 * });
 * ```
 *
 * @throws {PactError} INVALID_OPTION for a malformed option at build;
 *   UNKNOWN_MODULE / PERMISSION_NOT_IN_MODULE from `authorize()` at the
 *   call site.
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
        const [path, query] = splitTarget(req.originalUrl ?? req.url);
        verdict = await core.authenticate({
          method: req.method,
          path,
          query,
          authority: headerOf(req, 'host') ?? undefined,
          scheme: req.protocol,
          header: (name) => headerOf(req, name),
          body: () => Promise.resolve(rawBodyOf(req)),
        });
      } catch (error) {
        return next(error);
      }
      if (!verdict.ok) return send(res, verdict.denial);
      if (verdict.auth !== undefined) req.pact = verdict.auth;
      if (verdict.body !== undefined) req.pactBody = verdict.body;
      if (verdict.respond !== undefined) wrapJson(res, verdict.respond, next);
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

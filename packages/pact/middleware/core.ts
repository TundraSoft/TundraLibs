/**
 * @fileoverview `createPactMiddleware(pact, options)` — the framework-neutral
 * factory every adapter wraps: ONE options bag, ONE challenge, and the two
 * halves as pure functions over a request view and an auth context. An
 * adapter for any stack is a few lines mapping a verdict to its response.
 *
 * @module
 */
import type { Pact } from '../Pact.ts';
import type { PactAuthContext, PermissionBits } from '../types/mod.ts';
import { PACT_AUTH_FAILURE_CODES, PactError } from '../errors/mod.ts';
import type {
  PactMiddlewareCore,
  PactMiddlewareDenial,
  PactMiddlewareOptions,
} from './types/mod.ts';
import {
  DEFAULT_SCHEMES,
  extractCredential,
  failureResponse,
} from './shared.ts';

/** The scheme words a `WWW-Authenticate` challenge uses. */
const CHALLENGE_NAME = {
  BEARER: 'Bearer',
  BASIC: 'Basic',
  APIKEY: 'ApiKey',
  HMAC: 'HMAC',
} as const;

/** Build the `WWW-Authenticate` value: one challenge per scheme (RFC 7235). */
function challengeFor(options: PactMiddlewareOptions): string {
  const schemes = options.schemes ??
    (options.hmac === undefined
      ? DEFAULT_SCHEMES
      : [...DEFAULT_SCHEMES, 'HMAC']);
  const param = options.realm === undefined
    ? ''
    : ` realm="${options.realm.replace(/["\\]/g, '')}"`;
  return schemes.map((s) => `${CHALLENGE_NAME[s]}${param}`).join(', ');
}

/**
 * Build the neutral core over one instance and one options bag. The
 * adapters (`expressPact`, `fastifyPact`, `oakPact`, `honoPact`) are
 * thin glue over this; use it directly for any other framework.
 *
 * @example
 * ```ts ignore
 * const core = createPactMiddleware(pact, { optional: true });
 * async function myAuth(req: MyRequest, res: MyResponse, pass: () => void) {
 *   const verdict = await core.authenticate({
 *     method: req.method, path: req.pathname, header: (n) => req.headers.get(n),
 *   });
 *   if (!verdict.ok) return res.send(verdict.denial.status, verdict.denial.body, verdict.denial.headers);
 *   req.auth = verdict.auth;
 *   pass();
 * }
 * ```
 *
 * @throws {PactError} UNKNOWN_MODULE / PERMISSION_NOT_IN_MODULE from
 *   `authorize()` when the module or permission is not in the instance's
 *   catalog — at the call site, not on the first request.
 */
export function createPactMiddleware<
  B extends PermissionBits,
  M extends string,
>(
  pact: Pact<B, M>,
  options: PactMiddlewareOptions = {},
): PactMiddlewareCore<B, M> {
  const challenge = challengeFor(options);
  const denialHeaders = (status: number): Readonly<Record<string, string>> =>
    status === 401 && options.challenge !== false
      ? { 'www-authenticate': challenge }
      : {};
  const deny = (
    status: 401 | 403 | 409 | 500,
    error: string,
  ): PactMiddlewareDenial => ({
    status,
    body: { error },
    headers: denialHeaders(status),
  });

  return {
    challenge,
    async authenticate(req) {
      const credential = extractCredential(req, options);
      if (credential === null) {
        if (options.optional === true) return { ok: true, auth: undefined };
        return { ok: false, denial: deny(401, 'NO_CREDENTIALS') };
      }
      try {
        return { ok: true, auth: await pact.authenticate(credential) };
      } catch (error) {
        const failure = failureResponse(error);
        if (failure === null) throw error; // not pact's — the framework's error path
        return {
          ok: false,
          denial: deny(
            failure.status as PactMiddlewareDenial['status'],
            failure.body.error,
          ),
        };
      }
    },
    authorize(module, permission) {
      // getModulePermissions throws UNKNOWN_MODULE itself; the ceiling
      // check is ours. Both at BUILD time — a typo is a boot error.
      if (!pact.getModulePermissions(module).includes(permission)) {
        throw new PactError('PERMISSION_NOT_IN_MODULE', { permission, module });
      }
      return async (auth: PactAuthContext<M, B> | undefined) => {
        if (auth === undefined) return deny(401, 'NO_CREDENTIALS');
        try {
          await auth.principal.assert(module, permission);
          return undefined;
        } catch (error) {
          const failure = failureResponse(error);
          if (failure === null) throw error;
          return deny(
            failure.status as PactMiddlewareDenial['status'],
            failure.body.error,
          );
        }
      };
    },
  };
}

/** Re-exported for adapters that only need the failure set. */
export { PACT_AUTH_FAILURE_CODES };

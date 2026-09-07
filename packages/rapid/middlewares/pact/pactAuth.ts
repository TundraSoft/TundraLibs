/**
 * @fileoverview `pactAuth(pact, options)` — the `@tundralibs/pact` adapter:
 * ONE factory, ONE wire contract, two middlewares. `authenticate` turns a
 * presented credential into `ctx.auth` (pact's `PactAuthContext`);
 * `authorize(module, permission)` — typed by the instance's catalog — gates
 * on the bound principal. Both raise the same challenge on 401, because
 * both come from the same options. The same shape as pact's own
 * hono/oak/express/fastify adapters, with rapid's extras (bearer cookie,
 * split API-key headers, an async HMAC canonical builder).
 *
 * @module
 */

import {
  type Pact,
  PACT_AUTH_FAILURE_CODES,
  type PactAuthContext,
  PactError,
  type PermissionBits,
} from '@tundralibs/pact';
import { RapidError } from '../../errors/mod.ts';
import type { RapidContext, RapidMiddleware } from '../../types/mod.ts';
import {
  challengeFor,
  extractCredentialFrom,
  type PactAuthOptions,
  resolveSchemes,
} from './credentials.ts';

/** What {@link pactAuth} returns. */
export type PactAuthMiddlewares<B extends PermissionBits, M extends string> = {
  /**
   * Identify the caller: extract the credential, `pact.authenticate` it,
   * set `ctx.auth` to the {@link PactAuthContext}. HTTP reads the request
   * headers, a socket frame the UPGRADE request's headers, a job passes
   * through (no client). No credential → continues anonymous unless
   * `optional: false` (401). A credential that fails → 401, never
   * anonymous. Register once, before any `authorize`.
   */
  authenticate: RapidMiddleware;
  /**
   * Require `permission` in `module` of the authenticated principal
   * (pact's bound `principal.assert`, no store round-trip). 401 (with the
   * challenge) when `ctx.auth` is unset — so on a job it fails CLOSED —
   * and 403 when denied. Typed by the instance: an unknown module or
   * permission is a compile error, and a JS caller's typo is a
   * RAPID_CONFIG at the call site.
   */
  authorize: (module: M, permission: keyof B & string) => RapidMiddleware;
};

/**
 * Build the two pact middlewares over one instance and one options bag.
 * Create the instance and call this at module load (an `auth.ts`) — the
 * returned middlewares are plain values any route registration imports,
 * with no boot-order dependency.
 *
 * @example
 * ```ts ignore
 * // auth.ts
 * export const pact = Pact.create({ bits, modulePermissions, hooks });
 * export const { authenticate, authorize } = pactAuth(pact, {
 *   schemes: ['BEARER', 'APIKEY'],
 *   bearer: { cookie: 'session' }, // the cookie login({ cookie }) sets
 *   apiKey: {},                     // x-api-key / x-api-secret
 * });
 * // main.ts
 * app.use(onlyApi(authenticate));
 * app.get('/posts', authorize('Posts', 'READ'), list);
 * ```
 *
 * @throws {RapidError} RAPID_CONFIG from `authorize()` (at the call site)
 *   when `module` is not in the instance's catalog or `permission` is
 *   outside that module's ceiling.
 */
export function pactAuth<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options: PactAuthOptions = {},
): PactAuthMiddlewares<B, M> {
  const schemes = resolveSchemes(options);
  const optional = options.optional !== false;
  const challenge = options.challenge !== false
    ? challengeFor(schemes, options.realm)
    : undefined;

  const unauthenticated = (
    ctx: RapidContext,
    message: string,
    details?: Record<string, unknown>,
  ): RapidError => {
    // The challenge survives disclosure — it is set on the context, not
    // the reply — and only HTTP has a header to carry it.
    if (challenge !== undefined && ctx.type === 'HTTP') {
      ctx.setHeader('www-authenticate', challenge);
    }
    return new RapidError('RAPID_UNAUTHENTICATED', {
      message,
      ...(details !== undefined ? { details } : {}),
    });
  };

  const authenticate: RapidMiddleware = async (ctx, next) => {
    if (ctx.type === 'JOB') return await next();
    const headers = ctx.type === 'HTTP' ? ctx.headers : ctx.connection.headers;
    const credential = await extractCredentialFrom(
      ctx,
      headers,
      options,
      schemes,
    );
    if (credential === null) {
      if (optional) return await next();
      throw unauthenticated(ctx, 'no credential presented', {
        schemes: [...schemes],
      });
    }
    let auth: PactAuthContext<M, B>;
    try {
      auth = await pact.authenticate(credential);
    } catch (error) {
      // pact's auth-failure codes are ONE 401 here: which of "no such
      // key" / "wrong password" / "account disabled" it was is an
      // account oracle the wire must not carry (the server log has it).
      if (
        error instanceof PactError && PACT_AUTH_FAILURE_CODES.has(error.code)
      ) {
        ctx.app.log.info('pact authentication failed', {
          requestId: ctx.requestId,
          scheme: credential.scheme,
          code: error.code,
        });
        throw unauthenticated(ctx, 'invalid credential', {
          scheme: credential.scheme,
        });
      }
      throw error; // a hook failure, a misconfiguration: a real 500
    }
    // Stored by REFERENCE: the bound principal's assert/hasPermission live
    // in a WeakMap keyed by this object; a copy would lose them.
    ctx.setAuth(auth as unknown as Record<string, unknown>);
    return await next();
  };

  const authorize = (
    module: M,
    permission: keyof B & string,
  ): RapidMiddleware => {
    // Fail at the call site (boot), not on the first request: the
    // instance knows its catalog and each module's ceiling.
    if (!pact.modules.includes(module)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `authorize(): '${
          String(module)
        }' is not a module of this pact instance (known: ${
          pact.modules.join(', ')
        })`,
        details: { module },
      });
    }
    if (!pact.getModulePermissions(module).includes(permission)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `authorize(): '${permission}' is not a permission of module '${
          String(module)
        }' (ceiling: ${
          pact.getModulePermissions(module).map(String).join(', ')
        })`,
        details: { module, permission },
      });
    }
    return async (ctx, next) => {
      const auth = ctx.auth as PactAuthContext<M, B> | undefined;
      if (auth === undefined || typeof auth.principal?.assert !== 'function') {
        throw unauthenticated(ctx, 'authentication required');
      }
      try {
        await auth.principal.assert(module, permission);
      } catch (error) {
        if (error instanceof PactError && error.code === 'PERMISSION_DENIED') {
          throw new RapidError('RAPID_ACCESS_DENIED', {
            details: { module, permission },
          });
        }
        throw error;
      }
      return await next();
    };
  };

  return { authenticate, authorize };
}

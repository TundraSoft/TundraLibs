/**
 * @fileoverview `authenticate` + `authorize` — the two auth middlewares.
 * rapid owns only the auth bag (`ctx.auth`); these are OPTIONAL catalog
 * middleware you hand your own logic to (store/hook-injection, like
 * `rateLimit`). `authenticate` identifies (fills the bag, never rejects);
 * `authorize` enforces (401 anonymous, 403 denied). Both read/write the
 * same `ctx.auth`, so writing your own instead is a drop-in. The
 * The {@link jwt} and {@link permission} helpers wire `@tundralibs/pact`
 * in — `jwt(pact)` builds `authenticate`'s `verify` from a PACT instance's
 * JWT layer, `permission(perms, …)` builds an `authorize` check from its
 * bitmask grants. Both take pact as a type-only import, so using them adds
 * no runtime dependency unless you pass the pact object in.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidContext, RapidMiddleware } from '../types/mod.ts';

/** The authenticated identity — an app-shaped record; cast on use. */
export type AuthBag = Record<string, unknown>;

/** Options for {@link authenticate}. */
export type AuthenticateOptions = {
  /**
   * Pull the token from the request. Defaults to a bearer
   * `Authorization` header (HTTP) or the same header captured at socket
   * upgrade. Return `null` when absent.
   */
  extract?: (ctx: RapidContext) => string | null | Promise<string | null>;
  /**
   * Turn a token into the identity to store, or `null` to stay anonymous.
   * This is where your app verifies a JWT / looks a session up — rapid
   * never does. Runs only when `extract` yielded a token.
   */
  verify: (
    token: string,
    ctx: RapidContext,
  ) => AuthBag | null | Promise<AuthBag | null>;
};

const bearer = (ctx: RapidContext): string | null => {
  const header = ctx.type === 'HTTP'
    ? ctx.headers.get('authorization')
    : ctx.type === 'SOCKET'
    ? ctx.connection.headers.get('authorization')
    : null;
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]! : null;
};

/**
 * Identify the caller: extract a token, `verify` it, and on success write
 * `ctx.auth`. NEVER rejects — an anonymous request flows through with
 * `ctx.auth` left `undefined`, so public routes keep working. Guard with
 * {@link authorize} where it matters. Jobs (no request) are skipped.
 */
export function authenticate(options: AuthenticateOptions): RapidMiddleware {
  const extract = options.extract ?? bearer;
  return async (ctx, next) => {
    if (ctx.type !== 'JOB' && ctx.auth === undefined) {
      const token = await extract(ctx);
      if (token !== null && token !== '') {
        const identity = await options.verify(token, ctx);
        if (identity !== null) ctx.setAuth(identity);
      }
    }
    return next();
  };
}

/**
 * Enforce access. Rejects with `RAPID_UNAUTHENTICATED` (401) when
 * `ctx.auth` is absent, then — if a `check` is given — with
 * `RAPID_ACCESS_DENIED` (403) when it returns falsy. With no `check` it
 * just requires an authenticated caller.
 *
 * @throws {RapidError} RAPID_UNAUTHENTICATED / RAPID_ACCESS_DENIED.
 */
export function authorize(
  check?: (auth: AuthBag, ctx: RapidContext) => boolean | Promise<boolean>,
): RapidMiddleware {
  return async (ctx, next) => {
    const auth = ctx.auth;
    if (auth === undefined) {
      throw new RapidError('RAPID_UNAUTHENTICATED');
    }
    if (check !== undefined && !(await check(auth, ctx))) {
      throw new RapidError('RAPID_ACCESS_DENIED');
    }
    return next();
  };
}

/**
 * A minimal `@tundralibs/pact` shape — enough to read a permission check
 * without a runtime dependency on pact (type-only). Your app constructs
 * the real `Permissions` and passes it in.
 */
type PactLike = {
  has(
    module: string,
    permission: string,
    grants: Record<string, bigint>,
  ): boolean;
};

/**
 * Build an {@link authorize} check from a pact `Permissions` instance:
 * `authorize(permission(perms, 'Post', 'EDIT'))`. Reads the caller's
 * grants from `auth.grants` (override with `grantsKey`). pact is imported
 * by YOUR app and passed as `perms`; rapid keeps no pact dependency.
 */
export function permission(
  perms: PactLike,
  module: string,
  perm: string,
  grantsKey = 'grants',
): (auth: AuthBag) => boolean {
  return (auth) =>
    perms.has(module, perm, (auth[grantsKey] as Record<string, bigint>) ?? {});
}

/**
 * A minimal PACT-facade shape — enough to verify a token without a
 * runtime dependency on pact (type-only). Your app constructs the real
 * `PACT` and passes it in.
 */
type PactAuthLike = {
  verifyJWT(token: string): Promise<Record<string, unknown>>;
};

/**
 * Build {@link authenticate}'s `verify` from a pact `PACT` instance:
 * `authenticate({ verify: jwt(pact) })`. Verifies the bearer token via
 * pact's JWT layer and returns the claims as the auth bag; a token that
 * fails verification (bad signature, expired, revoked) yields `null`, so
 * the request stays anonymous rather than erroring — `authenticate` never
 * rejects. pact is imported by YOUR app and passed as `pact`.
 */
export function jwt(
  pact: PactAuthLike,
): (token: string) => Promise<AuthBag | null> {
  return async (token) => {
    try {
      return await pact.verifyJWT(token);
    } catch {
      return null;
    }
  };
}

/**
 * @fileoverview `login({ pact })` — a mountable login endpoint over a
 * `@tundralibs/pact` instance: `app.post('/login', login({ pact }))`. It
 * reads `{ identifier, password }` from the body (field names
 * configurable), runs `pact.login()`, and returns the session token plus a
 * MINIMAL principal (`{ id }` by default — a principal may carry internal
 * fields, and this endpoint is mounted as-is, so it never echoes the whole
 * record). With `cookie` set the token is ALSO issued as an HttpOnly cookie,
 * which is what `pactAuth(pact, { bearer: { cookie } })` reads for browser
 * UIs. 401 on a bad credential. pact is a type-only import here, so
 * `./endpoints` adds no runtime dependency on it.
 *
 * @module
 */
import { RapidError } from '../errors/mod.ts';
import type { RapidHTTPHandler } from '../types/mod.ts';

/** The slice of `@tundralibs/pact`'s `Pact` this endpoint needs (structural). */
type PactLoginLike = {
  login(credentials: { identifier: string; password: string }): Promise<{
    principal: { id: string } & Record<string, unknown>;
    session: { token: string; expiresAt: Date; refreshToken?: string };
  }>;
};

/**
 * pact's authentication-failure codes (`PACT_AUTH_FAILURE_CODES`), matched
 * structurally on `error.code` so this file stays free of a runtime pact
 * import. Anything else a `login()` throws is a real 500.
 */
const AUTH_FAILURE = new Set([
  'INVALID_CREDENTIALS',
  'NOT_ACTIVE',
  'SESSION_EXPIRED',
  'REFRESH_REUSED',
]);

/** Chrome / RFC 6265bis cap a cookie's lifetime at 400 days. */
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Options for {@link login}. */
export type LoginOptions = {
  /** Your configured pact instance. */
  pact: PactLoginLike;
  /** Body field names. @default { identifier: 'identifier', password: 'password' } */
  fields?: { identifier?: string; password?: string };
  /**
   * Also set the session token as an HttpOnly cookie under `name`
   * (`Max-Age` = the session's remaining lifetime) — the browser-UI
   * flow; pair with `pactAuth(pact, { bearer: { cookie: name } })`.
   */
  cookie?: {
    name: string;
    /** @default true */
    secure?: boolean;
    /** @default 'Lax' */
    sameSite?: 'Strict' | 'Lax' | 'None';
    /** @default '/' */
    path?: string;
  };
  /**
   * Project the principal into what the response exposes — the guard
   * against leaking internal fields. Defaults to `(p) => ({ id: p.id })`;
   * return more only when you mean to.
   */
  principal?: (principal: { id: string } & Record<string, unknown>) => unknown;
};

/**
 * An endpoint handler that logs a user in via pact and returns
 * `{ token, expiresAt, refreshToken?, principal }`.
 *
 * @throws {RapidError} RAPID_VALIDATION_FAILED (400) when the body lacks
 *   the two string fields; RAPID_UNAUTHENTICATED (401) on a pact
 *   authentication failure.
 */
export function login(options: LoginOptions): RapidHTTPHandler {
  const identifierField = options.fields?.identifier ?? 'identifier';
  const passwordField = options.fields?.password ?? 'password';
  const project = options.principal ?? ((p: { id: string }) => ({ id: p.id }));
  return async (ctx) => {
    const body = await ctx.payload;
    const identifier = (body as Record<string, unknown> | null)
      ?.[identifierField];
    const password = (body as Record<string, unknown> | null)?.[passwordField];
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      throw new RapidError('RAPID_VALIDATION_FAILED', {
        message:
          `body must carry string '${identifierField}' and '${passwordField}'`,
        details: { fields: [identifierField, passwordField] },
      });
    }
    let result: Awaited<ReturnType<PactLoginLike['login']>>;
    try {
      result = await options.pact.login({ identifier, password });
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && AUTH_FAILURE.has(code)) {
        // One 401 for every failure kind — never an account oracle.
        throw new RapidError('RAPID_UNAUTHENTICATED', {
          message: 'invalid credentials',
        });
      }
      throw error;
    }
    const { token, expiresAt, refreshToken } = result.session;
    return {
      status: 200,
      content: {
        token,
        expiresAt: expiresAt.toISOString(),
        ...(refreshToken !== undefined ? { refreshToken } : {}),
        principal: project(result.principal),
      },
      ...(options.cookie !== undefined
        ? {
          cookies: [{
            name: options.cookie.name,
            value: token,
            options: {
              httpOnly: true,
              secure: options.cookie.secure ?? true,
              sameSite: options.cookie.sameSite ?? 'Lax',
              path: options.cookie.path ?? '/',
              maxAge: Math.min(
                MAX_COOKIE_AGE_SECONDS,
                Math.max(
                  0,
                  Math.floor((expiresAt.getTime() - Date.now()) / 1000),
                ),
              ),
            },
          }],
        }
        : {}),
    };
  };
}

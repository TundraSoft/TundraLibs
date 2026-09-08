/**
 * @fileoverview `pactAuth(pact, options)` — the `@tundralibs/pact` adapter:
 * rapid's glue over pact's own neutral middleware core, the same shape as
 * pact's express/fastify/oak/hono adapters. One factory, one wire
 * contract, two middlewares: `authenticate` turns a presented credential
 * into `ctx.auth` (pact's `PactAuthContext`) and seals the response after
 * `next()` when the caller is HMAC-signed or exchanging encrypted
 * payloads; `authorize(module, permission)` — typed by the instance's
 * catalog — gates on the bound principal. Rapid adds what pact leaves to
 * the framework: a bearer cookie for browser UIs, socket frames
 * authenticating from the upgrade request, jobs passing through, and
 * rapid's own error codes on the wire. Published as the
 * `@tundralibs/rapid/middlewares/pact` subpath — opt-in and deliberately
 * outside the `./middlewares` barrel, so importing the core middleware
 * catalog never pulls `@tundralibs/pact` in.
 *
 * @module
 */

import {
  type Pact,
  PACT_AUTH_FAILURE_CODES,
  type PactAuthContext,
  type PactLoginResult,
  type PactPrincipal,
  type PermissionBits,
} from '@tundralibs/pact';
import {
  createPactMiddleware,
  type PactMiddlewareDenial,
  type PactMiddlewareOptions,
  type PactMiddlewareRequest,
  type PactMiddlewareVerdict,
  resolveOptions,
} from '@tundralibs/pact/middleware';
import type { HTTPContext } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidContext,
  RapidContextResponse,
  RapidContextState,
  RapidHTTPHandler,
  RapidMiddleware,
} from '../types/mod.ts';
import { parseCookies } from '../utils/cookies.ts';
import { markOpenApi } from './openapiMeta.ts';
import { isStreamBody } from '../utils/streams.ts';

/** The shape `ctx.auth` holds after `authenticate` — re-exported for handlers. */
export type { PactAuthContext } from '@tundralibs/pact';

/**
 * Options for `pactAuth()` — pact's `PactMiddlewareOptions` (carriers per
 * scheme, `hmac`, `encryption`, `challenge`, `realm`) plus rapid's bearer
 * cookie. Two defaults differ from pact's framework adapters: `optional`
 * is `true` here (an absent credential continues anonymous — `authorize`
 * still rejects it), and the challenge/error bodies use rapid's codes.
 */
export type PactAuthOptions = Omit<PactMiddlewareOptions, 'bearer'> & {
  /**
   * `true`: a request with no credential continues anonymous (`ctx.auth`
   * unset). `false`: it is a 401. A credential that IS presented is
   * always verified and fails with 401 when invalid, whatever this says.
   * @default true
   */
  optional?: boolean;
  bearer?: NonNullable<PactMiddlewareOptions['bearer']> & {
    /**
     * A cookie carrying the session token — how a browser UI presents the
     * token your login route set. Read when the bearer header is
     * absent; on a socket frame, from the upgrade request's cookies.
     * @default none — header only
     */
    cookie?: string;
  };
  /**
   * The session handlers (`login` / `logout` / `refresh` / `me`). The
   * cookie they set and clear is `bearer.cookie` — declared once, so the
   * cookie `login` sets is exactly the one `authenticate` reads. Without
   * `bearer.cookie` the token travels in the body only.
   */
  session?: {
    /**
     * Body field names `login` reads.
     * @default { identifier: 'identifier', password: 'password' }
     */
    fields?: { identifier?: string; password?: string };
    /**
     * Attributes of the session cookie (always `HttpOnly`; `Max-Age` is the
     * session's remaining life, capped at 400 days).
     * @default { secure: true, sameSite: 'Lax', path: '/' }
     */
    cookie?: {
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
      path?: string;
    };
    /**
     * A cookie carrying the REFRESH token for browser flows (JWT strategy):
     * `login` sets it, `refresh` reads it and rotates it, `logout` clears
     * it. Without it the refresh token is returned in the body and
     * `refresh` reads `refreshToken` from the body.
     * @default none — body only
     */
    refreshCookie?: string;
    /**
     * What of the principal `login`, `refresh` and `me` return. The
     * default is deliberately minimal — grants, status and metadata are
     * yours to expose field by field.
     * @default (p) => ({ id: p.id })
     */
    principal?: (principal: PactPrincipal<string>) => unknown;
  };
};

/** What {@link pactAuth} returns. */
export type PactAuthMiddlewares<B extends PermissionBits, M extends string> = {
  /**
   * Identify the caller: extract the credential, `pact.authenticate` it,
   * set `ctx.auth` to the {@link PactAuthContext}. HTTP reads the request
   * headers (and the raw body, for an HMAC digest or a JWE), a socket
   * frame the upgrade request's headers (header-only schemes), a job
   * passes through (no client). No credential → continues anonymous
   * unless `optional: false` (401). A credential that fails → 401, never
   * anonymous. After `next()` an HMAC caller's response is signed and a
   * JWE caller's response encrypted; a thrown error is answered unsealed.
   * Register once, before anything that reads the body and before any
   * `authorize`.
   */
  authenticate: RapidMiddleware;
  /**
   * Require `permission` in `module` of the authenticated principal
   * (pact's bound `principal.assert`, no store round-trip). 401 (with the
   * challenge) when `ctx.auth` is unset — so on a job it fails closed —
   * and 403 when denied. Typed by the instance: an unknown module or
   * permission is a compile error, and a JS caller's typo is a
   * RAPID_CONFIG at the call site.
   */
  authorize: (module: M, permission: keyof B & string) => RapidMiddleware;
  /**
   * `POST` handler: `pact.login({ identifier, password })` from the body
   * (`session.fields` names) → `200 { token, expiresAt, refreshToken?,
   * principal }` and the session cookie when `bearer.cookie` is set. A
   * malformed body is 400; every pact authentication failure is ONE 401
   * (`invalid credentials`) — never an account oracle; anything else is a
   * real 500.
   */
  login: () => RapidHTTPHandler;
  /**
   * `POST` handler: ends the presented session (`pact.logout`, from the
   * bearer header or the cookie; idempotent — an unknown token still
   * clears the cookie) → 204.
   */
  logout: () => RapidHTTPHandler;
  /**
   * `POST` handler (JWT strategy): `pact.refresh(refreshToken)` from the
   * refresh cookie or the body → the same reply shape as `login` with the
   * rotated tokens. 401 on an expired or reused token; `RAPID_CONFIG` when
   * the instance is not on the JWT strategy.
   */
  refresh: () => RapidHTTPHandler;
  /**
   * `GET` handler: `{ principal, via }` for the current credential, through
   * the same `session.principal` projection `login` uses; 401 when
   * anonymous. Mount it after `authenticate`.
   */
  me: () => RapidHTTPHandler;
};

const JOSE = 'application/jose';

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
 *   bearer: { cookie: 'session' }, // the cookie your login route sets
 *   apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
 * });
 * // main.ts
 * app.use(onlyApi(authenticate));
 * app.get('/posts', authorize('Posts', 'READ'), list);
 * ```
 *
 * @throws {RapidError} RAPID_CONFIG for a malformed option (pact's
 *   `INVALID_OPTION`, rewrapped) and from `authorize()` at the call site
 *   when `module` is not in the instance's catalog or `permission` is
 *   outside that module's ceiling.
 */
export function pactAuth<B extends PermissionBits, M extends string>(
  pact: Pact<B, M>,
  options: PactAuthOptions = {},
): PactAuthMiddlewares<B, M> {
  const { bearer, optional, ...rest } = options;
  const { cookie, ...bearerCarrier } = bearer ?? {};
  const coreOptions: PactMiddlewareOptions = {
    ...rest,
    bearer: bearerCarrier,
    optional: optional !== false,
  };
  let config: ReturnType<typeof resolveOptions>;
  try {
    config = resolveOptions(coreOptions);
  } catch (error) {
    throw new RapidError('RAPID_CONFIG', {
      message: `pactAuth(): ${
        error instanceof Error ? error.message : String(error)
      }`,
      cause: error instanceof Error ? error : undefined,
    });
  }
  const core = createPactMiddleware(pact, coreOptions);
  // A socket frame authenticates from its upgrade request: header-only
  // schemes, no body, no per-frame HMAC freshness, nothing to seal.
  const socketCore = createPactMiddleware(pact, {
    ...coreOptions,
    schemes: [...config.schemes].filter((s) => s !== 'HMAC'),
    encryption: undefined,
  });
  const bearerPrefix = config.bearer.prefix;

  /** Header lookup with the bearer cookie standing in for a missing bearer header. */
  const headerOf =
    (headers: Headers): PactMiddlewareRequest['header'] => (name) => {
      const value = headers.get(name);
      if (value !== null || cookie === undefined) return value;
      if (name.toLowerCase() !== config.bearer.header) return null;
      const token = parseCookies(headers.get('cookie'))[cookie];
      if (token === undefined || token === '') return null;
      return bearerPrefix === '' ? token : `${bearerPrefix} ${token}`;
    };

  /** The 401 for one denial code — one answer on the wire, the code in the log. */
  const unauthenticated = (
    ctx: RapidContext,
    code: string,
    details: Record<string, unknown> | undefined,
  ): RapidError => {
    if (code === 'NO_CREDENTIALS') {
      return new RapidError('RAPID_UNAUTHENTICATED', {
        message: 'no credential presented',
        details: { schemes: [...config.schemes], ...details },
      });
    }
    // Which of "no such key" / "wrong password" / "disabled" it was is an
    // account oracle the wire must not carry — the log has it.
    ctx.app.log.info('pact authentication failed', {
      requestId: ctx.requestId,
      code,
    });
    if (code === 'STALE_TIMESTAMP') {
      return new RapidError('RAPID_UNAUTHENTICATED', {
        message: 'signature timestamp missing or outside the accepted window',
        details: { reason: code, ...details },
      });
    }
    return new RapidError('RAPID_UNAUTHENTICATED', {
      message: 'invalid credential',
      ...(details !== undefined ? { details } : {}),
    });
  };

  /** Turn a denial into rapid's error, carrying the challenge on HTTP. */
  const denied = (
    ctx: RapidContext,
    denial: PactMiddlewareDenial,
    details?: Record<string, unknown>,
  ): RapidError => {
    if (ctx.type === 'HTTP') {
      for (const [name, value] of Object.entries(denial.headers)) {
        ctx.setHeader(name, value);
      }
    }
    const code = denial.body.error;
    switch (denial.status) {
      case 401:
        return unauthenticated(ctx, code, details);
      case 403:
        return new RapidError('RAPID_ACCESS_DENIED', {
          ...(details !== undefined ? { details } : {}),
        });
      case 400:
        return new RapidError('RAPID_VALIDATION_FAILED', {
          message: 'encrypted payload rejected',
          details: { reason: code },
        });
      default:
        ctx.app.log.error('pact rejected the request', {
          requestId: ctx.requestId,
          code,
        });
        return new RapidError('RAPID_CONFIG', {
          message: `pact rejected the request: ${code}`,
        });
    }
  };

  /** The request view of an HTTP context — full target, headers, raw body. */
  const viewOf = (
    ctx: HTTPContext<RapidContextState>,
  ): PactMiddlewareRequest => {
    const url = new URL(ctx.url);
    return {
      method: ctx.method,
      path: url.pathname,
      query: url.search,
      authority: url.host,
      scheme: url.protocol.replace(/:$/, ''),
      header: headerOf(ctx.headers),
      body: () => ctx.rawPayload,
    };
  };

  /**
   * The response as it will be sent, or `undefined` for a stream. A plain
   * object is serialized here so the sealed bytes are the sent bytes; the
   * context is updated to send exactly that string.
   */
  const finished = (
    ctx: HTTPContext<RapidContextState>,
  ): Uint8Array | string | null | undefined => {
    const content = ctx.response?.content ?? null;
    const status = ctx.status;
    if (
      content === null || status === 204 || status === 205 || status === 304
    ) {
      return null;
    }
    if (isStreamBody(content)) return undefined;
    if (typeof content === 'string' || content instanceof Uint8Array) {
      return content;
    }
    const json = JSON.stringify(content);
    ctx.response = {
      content: json,
      headers: {
        'content-type': ctx.responseHeaders.get('content-type') ??
          'application/json',
      },
    };
    return json;
  };

  /** Sign and/or encrypt the finished HTTP response in place. */
  const seal = async (
    ctx: HTTPContext<RapidContextState>,
    respond: NonNullable<
      Extract<PactMiddlewareVerdict<M, B>, { ok: true }>['respond']
    >,
  ): Promise<void> => {
    if (ctx.responded) return;
    const body = finished(ctx);
    if (body === undefined) return;
    const patch = await respond({ status: ctx.status, body });
    if (patch.body !== undefined) {
      ctx.response = {
        content: patch.body,
        headers: { 'content-type': JOSE },
      };
    }
    for (const [name, value] of Object.entries(patch.headers)) {
      ctx.setHeader(name, value);
    }
  };

  const authenticate: RapidMiddleware = async (ctx, next) => {
    if (ctx.type === 'JOB') return await next();
    if (ctx.type === 'SOCKET') {
      const verdict = await socketCore.authenticate({
        method: 'GET',
        path: '',
        header: headerOf(ctx.connection.headers),
      });
      if (!verdict.ok) throw denied(ctx, verdict.denial);
      if (verdict.auth !== undefined) {
        ctx.setAuth(verdict.auth as unknown as Record<string, unknown>);
      }
      return await next();
    }
    const verdict = await core.authenticate(viewOf(ctx));
    if (!verdict.ok) {
      // A STALE BEARER COOKIE is the one credential a browser keeps
      // presenting after the session ended (logout elsewhere, expiry): a
      // 401 here would lock the user out of /login itself. It is cleared
      // and the request continues anonymous — a header credential that
      // fails stays a 401, never anonymous.
      if (
        cookie !== undefined && verdict.denial.status === 401 &&
        ctx.headers.get(config.bearer.header) === null &&
        ctx.cookies[cookie] !== undefined
      ) {
        ctx.app.log.info('stale session cookie cleared', {
          requestId: ctx.requestId,
        });
        ctx.deleteCookie(cookie, {
          path: options.session?.cookie?.path ?? '/',
        });
        if (optional === false) {
          throw unauthenticated(ctx, 'NO_CREDENTIALS', undefined);
        }
        return await next();
      }
      throw denied(ctx, verdict.denial);
    }
    if (verdict.auth !== undefined) {
      // Stored by reference: the bound principal's assert/hasPermission
      // live in a WeakMap keyed by this object; a copy would lose them.
      ctx.setAuth(verdict.auth as unknown as Record<string, unknown>);
    }
    if (verdict.body !== undefined) ctx._replacePayload(verdict.body);
    const outcome = await next();
    if (verdict.respond !== undefined) await seal(ctx, verdict.respond);
    return outcome;
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
    const guard = core.authorize(module, permission);
    return markOpenApi(async (ctx, next) => {
      const denial = await guard(ctx.auth as PactAuthContext<M, B> | undefined);
      if (denial !== undefined) {
        throw denied(ctx, denial, { module, permission });
      }
      return await next();
    }, openapiMeta);
  };

  // ---- OpenAPI: what the guard requires, and the schemes it accepts, so a
  // route guarded by authorize() documents itself.
  const securitySchemes: Record<string, Record<string, unknown>> = {};
  for (const scheme of config.schemes) {
    if (scheme === 'BEARER') {
      securitySchemes.bearerAuth = config.bearer.header === 'authorization' &&
          config.bearer.prefix.toLowerCase() === 'bearer'
        ? { type: 'http', scheme: 'bearer' }
        : {
          type: 'apiKey',
          in: 'header',
          name: config.bearer.header,
          description: `\`${config.bearer.prefix} <token>\``.trim(),
        };
      if (cookie !== undefined) {
        securitySchemes.cookieAuth = {
          type: 'apiKey',
          in: 'cookie',
          name: cookie,
        };
      }
    } else if (scheme === 'BASIC') {
      securitySchemes.basicAuth = config.basic.header === 'authorization'
        ? { type: 'http', scheme: 'basic' }
        : { type: 'apiKey', in: 'header', name: config.basic.header };
    } else if (scheme === 'APIKEY') {
      securitySchemes.apiKeyAuth = 'header' in config.apiKey
        ? {
          type: 'apiKey',
          in: 'header',
          name: config.apiKey.header,
          description: `\`${config.apiKey.prefix} <key>:<secret>\``.trim(),
        }
        : {
          type: 'apiKey',
          in: 'header',
          name: config.apiKey.keyHeader,
          description: `with the secret in \`${config.apiKey.secretHeader}\``,
        };
    } else if (scheme === 'HMAC') {
      securitySchemes.hmacAuth = {
        type: 'apiKey',
        in: 'header',
        name: config.hmac.signatureHeader,
        description:
          `RFC 9421 HTTP message signature — key in \`${config.hmac.keyHeader}\`, timestamp in \`${config.hmac.timestampHeader}\``,
      };
    }
  }
  const openapiMeta = {
    security: Object.keys(securitySchemes),
    securitySchemes,
  };

  // ---- Session handlers over the instance's login/logout/refresh.
  const session = options.session ?? {};
  const fields = {
    identifier: session.fields?.identifier ?? 'identifier',
    password: session.fields?.password ?? 'password',
  };
  const project = session.principal ??
    ((p: PactPrincipal<string>) => ({ id: p.id }));
  const cookieAttrs = {
    httpOnly: true,
    secure: session.cookie?.secure ?? true,
    sameSite: session.cookie?.sameSite ?? 'Lax',
    path: session.cookie?.path ?? '/',
  } as const;
  /** Chrome / RFC 6265bis cap a cookie's lifetime at 400 days. */
  const MAX_COOKIE_AGE = 400 * 24 * 60 * 60;
  const remaining = (expiresAt: Date): number =>
    Math.min(
      MAX_COOKIE_AGE,
      Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    );
  const sessionReply = (
    result: PactLoginResult<M>,
  ): RapidContextResponse => {
    const { token, expiresAt, refreshToken } = result.session;
    const cookies: NonNullable<RapidContextResponse['cookies']>[number][] = [];
    if (cookie !== undefined) {
      cookies.push({
        name: cookie,
        value: token,
        options: { ...cookieAttrs, maxAge: remaining(expiresAt) },
      });
    }
    if (session.refreshCookie !== undefined && refreshToken !== undefined) {
      cookies.push({
        name: session.refreshCookie,
        value: refreshToken,
        options: { ...cookieAttrs, maxAge: MAX_COOKIE_AGE },
      });
    }
    return {
      content: {
        token,
        expiresAt: expiresAt.toISOString(),
        ...(refreshToken !== undefined && session.refreshCookie === undefined
          ? { refreshToken }
          : {}),
        principal: project(result.principal as PactPrincipal<string>),
      },
      ...(cookies.length > 0 ? { cookies } : {}),
    };
  };
  /** pact's authentication failures → ONE 401; anything else is the caller's 500. */
  const authFailure = (ctx: RapidContext, error: unknown): unknown => {
    const code = (error as { code?: unknown } | null)?.code;
    if (
      typeof code === 'string' &&
      (PACT_AUTH_FAILURE_CODES as ReadonlySet<string>).has(code)
    ) {
      ctx.app.log.info('pact session operation refused', {
        requestId: ctx.requestId,
        code,
      });
      return new RapidError('RAPID_UNAUTHENTICATED', {
        message: 'invalid credentials',
      });
    }
    return error;
  };
  const bodyOf = async (
    ctx: HTTPContext,
  ): Promise<Record<string, unknown> | null> => {
    const body = await ctx.payload;
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  };
  /** The presented bearer token — header (prefix stripped) or the cookie. */
  const presentedToken = (ctx: HTTPContext): string | undefined => {
    const raw = headerOf(ctx.headers)(config.bearer.header);
    if (raw === null) return undefined;
    if (bearerPrefix === '') return raw;
    return raw.toLowerCase().startsWith(`${bearerPrefix.toLowerCase()} `)
      ? raw.slice(bearerPrefix.length + 1).trim()
      : raw;
  };

  const login = (): RapidHTTPHandler => async (ctx) => {
    const body = await bodyOf(ctx);
    const identifier = body?.[fields.identifier];
    const password = body?.[fields.password];
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      throw new RapidError('RAPID_VALIDATION_FAILED', {
        message:
          `body must carry string '${fields.identifier}' and '${fields.password}'`,
        details: { fields: [fields.identifier, fields.password] },
      });
    }
    let result: PactLoginResult<M>;
    try {
      result = await pact.login({ identifier, password });
    } catch (error) {
      throw authFailure(ctx, error);
    }
    return sessionReply(result);
  };

  const logout = (): RapidHTTPHandler => async (ctx) => {
    const token = presentedToken(ctx);
    // Idempotent: an unknown or already-ended token still clears the cookie.
    if (token !== undefined) await pact.logout(token).catch(() => {});
    if (cookie !== undefined) {
      ctx.deleteCookie(cookie, { path: cookieAttrs.path });
    }
    if (session.refreshCookie !== undefined) {
      ctx.deleteCookie(session.refreshCookie, { path: cookieAttrs.path });
    }
    return { status: 204, content: '' };
  };

  const refresh = (): RapidHTTPHandler => async (ctx) => {
    const fromCookie = session.refreshCookie !== undefined
      ? ctx.cookies[session.refreshCookie]
      : undefined;
    const token = fromCookie ?? (await bodyOf(ctx))?.refreshToken;
    if (typeof token !== 'string' || token === '') {
      throw new RapidError('RAPID_VALIDATION_FAILED', {
        message: session.refreshCookie !== undefined
          ? `refresh token cookie '${session.refreshCookie}' missing`
          : "body must carry a string 'refreshToken'",
      });
    }
    let result: PactLoginResult<M>;
    try {
      result = await pact.refresh(token);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === 'INVALID_OPTION') {
        throw new RapidError('RAPID_CONFIG', {
          message:
            "refresh() needs the pact instance on session.strategy 'JWT'",
          cause: error instanceof Error ? error : undefined,
        });
      }
      throw authFailure(ctx, error);
    }
    return sessionReply(result);
  };

  const me = (): RapidHTTPHandler => (ctx) => {
    const auth = ctx.auth as PactAuthContext<M, B> | undefined;
    if (auth === undefined) {
      throw unauthenticated(ctx, 'NO_CREDENTIALS', undefined);
    }
    return {
      content: {
        principal: project(auth.principal as unknown as PactPrincipal<string>),
        via: auth.via,
      },
    };
  };

  return { authenticate, authorize, login, logout, refresh, me };
}

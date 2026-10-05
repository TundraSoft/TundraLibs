/**
 * @fileoverview `pactAuth(pact, options)` — the `@tundralibs/pact` adapter:
 * rapid's glue over pact's own neutral middleware core, the same shape as
 * pact's express/fastify/oak/hono adapters. One factory, one wire
 * contract: the `binding` for `app.auth()` turns a presented credential
 * into `ctx.auth` (pact's `PactAuthContext`), judges `access` strings
 * against the bound principal's grants, and seals the response when the
 * caller is HMAC-signed or exchanging encrypted payloads;
 * `authorize(module, permission)` — typed by the instance's catalog — is
 * the per-route guard for an extra check. Rapid adds what pact leaves to
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
  type PactCredential,
  type PactGrantKey,
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
  RapidAccessContext,
  RapidAuthBinding,
  RapidContext,
  RapidContextResponse,
  RapidContextState,
  RapidContextSurface,
  RapidHTTPHandler,
  RapidMiddleware,
} from '../types/mod.ts';
import { parseCookies } from '../utils/cookies.ts';
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
   * The tenant an access check runs under, for grants keyed per tenant
   * (pact's `acme::Posts`). Return the tenant code — from a route param,
   * a subdomain, a header, or what a middleware put in `ctx.state` (the
   * only request detail an in-process `invoke()` carries) — or `null`
   * for none. With a tenant, `'Posts:READ'` and `authorize('Posts',
   * 'READ')` check `<tenant>::Posts`, where pact also counts the
   * principal's global `Posts` grant. Absent or `null`, the check is the
   * global one.
   * @default none — global grants only
   */
  tenant?: (
    ctx: RapidAccessContext,
  ) => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Narrow what one surface accepts. `schemes` is a subset of `schemes`
   * for requests on that surface — a credential of any other scheme is
   * treated as absent there. `cookie: false` stops reading `bearer.cookie`
   * on that surface, so a browser session cannot drive the API surface
   * (no cookie-borne requests there means no CSRF there). Sockets and
   * jobs have no surface and use the top-level settings.
   * @default both surfaces accept everything the top level does
   */
  surfaces?: Partial<
    Record<RapidContextSurface, {
      schemes?: readonly PactCredential['scheme'][];
      cookie?: boolean;
    }>
  >;
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
     * Lifetime of the refresh cookie in SECONDS — pact does not report the
     * refresh token's expiry, so match it to the instance's
     * `session.refresh.ttl` (pact's default is 7 days).
     * @default 604800
     */
    refreshMaxAge?: number;
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
   * The binding for `app.auth(…)`. `authenticate` identifies the caller:
   * extracts the credential, `pact.authenticate`s it, answers the
   * {@link PactAuthContext}. HTTP reads the request headers (and the raw
   * body, for an HMAC digest or a JWE), a socket frame the upgrade
   * request's headers (header-only schemes), a job has no caller
   * (anonymous). No credential → anonymous unless `optional: false`
   * (401). A credential that fails → 401, never anonymous. `authorize`
   * judges the `access` string: `'Module:PERMISSION'` → the bound
   * principal's grant (unknown module/permission → denied), `'signed-in'`
   * → any identity, several clauses joined with `|` → any of them.
   * `finish` signs an HMAC caller's response and encrypts a JWE caller's.
   */
  binding: RapidAuthBinding;
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
   * anonymous (the app must bind `binding`).
   */
  me: () => RapidHTTPHandler;
};

const JOSE = 'application/jose';

/**
 * The signed-exchange refusals that are the client's own mistake, not an
 * account fact — named on the wire so a client can fix its signer.
 */
const SIGNING_FAILURES: Readonly<Record<string, string>> = {
  STALE_TIMESTAMP: 'signature timestamp missing or outside the accepted window',
  INVALID_NONCE: 'signature nonce missing or longer than 128 characters',
  NONCE_REUSED: 'signature nonce already used within the accepted window',
};

/**
 * Refuse a `surfaces` option that names an unknown surface, a scheme the
 * top level does not accept, or a cookie there is none of.
 *
 * @throws {RapidError} RAPID_CONFIG naming the offending key.
 */
function checkSurfaces(
  surfaces: PactAuthOptions['surfaces'],
  hasCookie: boolean,
  accepted: ReadonlySet<PactCredential['scheme']>,
): void {
  const fail = (message: string): never => {
    throw new RapidError('RAPID_CONFIG', { message: `pactAuth(): ${message}` });
  };
  for (const [surface, narrowed] of Object.entries(surfaces ?? {})) {
    if (surface !== 'ui' && surface !== 'api') {
      fail(`surfaces.${surface}: the surfaces are 'ui' and 'api'`);
    }
    if (narrowed?.cookie === true && !hasCookie) {
      fail(`surfaces.${surface}.cookie: there is no bearer.cookie to read`);
    }
    const foreign = (narrowed?.schemes ?? []).filter((s) => !accepted.has(s));
    if (foreign.length > 0) {
      fail(
        `surfaces.${surface}.schemes: ${foreign.join(', ')} not in the ` +
          `accepted schemes (${[...accepted].join(', ')})`,
      );
    }
  }
}

/**
 * Build the auth binding, the `authorize` guard and the session handlers
 * over one instance and one options bag. Create the instance and call
 * this at module load (an `auth.ts`) — the returned values are plain
 * values any route registration imports, with no boot-order dependency.
 *
 * @example
 * ```ts ignore
 * // auth.ts
 * export const pact = Pact.create({ bits, modulePermissions, hooks });
 * export const { binding, login } = pactAuth(pact, {
 *   schemes: ['BEARER', 'APIKEY'],
 *   bearer: { cookie: 'session' }, // the cookie your login route sets
 *   apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
 * });
 * // main.ts
 * app.auth(binding);
 * app.get('/posts', { access: 'Posts:READ' }, list);
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
  const { bearer, optional, tenant, surfaces, ...rest } = options;
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
  checkSurfaces(surfaces, cookie !== undefined, config.schemes);
  // One core per surface that narrows its schemes; the rest use `core`.
  const surfaceCores = new Map<RapidContextSurface, typeof core>();
  for (const [surface, narrowed] of Object.entries(surfaces ?? {})) {
    if (narrowed?.schemes === undefined) continue;
    surfaceCores.set(
      surface as RapidContextSurface,
      createPactMiddleware(pact, { ...coreOptions, schemes: narrowed.schemes }),
    );
  }
  /** Whether `bearer.cookie` is read on `surface`. */
  const cookieOn = (surface: RapidContextSurface): boolean =>
    cookie !== undefined && surfaces?.[surface]?.cookie !== false;
  // A socket frame authenticates from its upgrade request: header-only
  // schemes, no body, no per-frame HMAC freshness, nothing to seal.
  const socketCore = createPactMiddleware(pact, {
    ...coreOptions,
    schemes: [...config.schemes].filter((s) => s !== 'HMAC'),
    encryption: undefined,
  });
  const bearerPrefix = config.bearer.prefix;
  // The headers of the OTHER carriers the instance accepts. pact reads
  // BEARER first and stops at the first credential it finds, so the cookie
  // may only stand in for the bearer header when none of these is present —
  // otherwise a stale session cookie would silently veto a valid API key,
  // and a live one would authenticate the browser session instead of it.
  const otherCarriers = new Set<string>();
  if (config.schemes.has('APIKEY')) {
    const k = config.apiKey;
    for (
      const h of 'header' in k ? [k.header] : [k.keyHeader, k.secretHeader]
    ) {
      otherCarriers.add(h.toLowerCase());
    }
  }
  if (config.schemes.has('HMAC')) {
    otherCarriers.add(config.hmac.keyHeader.toLowerCase());
    otherCarriers.add(config.hmac.signatureHeader.toLowerCase());
  }
  otherCarriers.delete(config.bearer.header);
  const otherCarrierPresent = (headers: Headers): boolean => {
    for (const carrier of otherCarriers) {
      if (headers.get(carrier) !== null) return true;
    }
    return false;
  };

  /** Header lookup with the bearer cookie standing in for a missing bearer header. */
  const headerOf = (
    headers: Headers,
    withCookie: boolean = cookie !== undefined,
  ): PactMiddlewareRequest['header'] =>
  (name) => {
    const value = headers.get(name);
    if (value !== null || !withCookie || cookie === undefined) return value;
    if (name.toLowerCase() !== config.bearer.header) return null;
    if (otherCarrierPresent(headers)) return null;
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
      const schemes = ctx.type === 'HTTP'
        ? surfaces?.[ctx.surface]?.schemes ?? [...config.schemes]
        : [...config.schemes];
      return new RapidError('RAPID_UNAUTHENTICATED', {
        message: 'no credential presented',
        details: { schemes, ...details },
      });
    }
    // Which of "no such key" / "wrong password" / "disabled" it was is an
    // account oracle the wire must not carry — the log has it.
    ctx.app.log.info('pact authentication failed', {
      requestId: ctx.requestId,
      code,
    });
    const signing = SIGNING_FAILURES[code];
    if (signing !== undefined) {
      return new RapidError('RAPID_UNAUTHENTICATED', {
        message: signing,
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
      header: headerOf(ctx.headers, cookieOn(ctx.surface)),
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

  /**
   * The identification behind `binding.authenticate`: the identity (or
   * `undefined` for anonymous), with the response sealer when the caller
   * is HMAC-signed / JWE. A refused credential throws rapid's 401/403.
   */
  const identify = async (
    ctx: RapidContext,
  ): Promise<
    {
      auth: Record<string, unknown> | undefined;
      respond?: NonNullable<
        Extract<PactMiddlewareVerdict<M, B>, { ok: true }>['respond']
      >;
    }
  > => {
    if (ctx.type === 'JOB') return { auth: undefined };
    if (ctx.type === 'SOCKET') {
      const verdict = await socketCore.authenticate({
        method: 'GET',
        path: '',
        header: headerOf(ctx.connection.headers),
      });
      if (!verdict.ok) throw denied(ctx, verdict.denial);
      return {
        auth: verdict.auth as unknown as Record<string, unknown> | undefined,
      };
    }
    const verdict = await (surfaceCores.get(ctx.surface) ?? core).authenticate(
      viewOf(ctx),
    );
    if (!verdict.ok) {
      // A STALE BEARER COOKIE is the one credential a browser keeps
      // presenting after the session ended (logout elsewhere, expiry): a
      // 401 here would lock the user out of /login itself. It is cleared
      // and the request continues anonymous — a header credential that
      // fails stays a 401, never anonymous.
      // Only when the COOKIE was the credential that failed — a rejected
      // API key or HMAC signature on the same request stays a 401.
      if (
        cookieOn(ctx.surface) && verdict.denial.status === 401 &&
        ctx.headers.get(config.bearer.header) === null &&
        !otherCarrierPresent(ctx.headers) &&
        ctx.cookies[cookie!] !== undefined
      ) {
        ctx.app.log.info('stale session cookie cleared', {
          requestId: ctx.requestId,
        });
        ctx.deleteCookie(cookie!, {
          path: options.session?.cookie?.path ?? '/',
        });
        if (optional === false) {
          throw unauthenticated(ctx, 'NO_CREDENTIALS', undefined);
        }
        return { auth: undefined };
      }
      throw denied(ctx, verdict.denial);
    }
    if (verdict.body !== undefined) ctx._replacePayload(verdict.body);
    return {
      // Stored by reference: the bound principal's assert/hasPermission
      // live in a WeakMap keyed by this object; a copy would lose them.
      auth: verdict.auth as unknown as Record<string, unknown> | undefined,
      ...(verdict.respond !== undefined ? { respond: verdict.respond } : {}),
    };
  };

  // ---- The binding: the identification, the string policy, the seal.
  /** The sealer each HMAC/JWE request's `identify` produced, until `finish`. */
  const sealers = new WeakMap<
    object,
    NonNullable<Extract<PactMiddlewareVerdict<M, B>, { ok: true }>['respond']>
  >();
  /** `core.authorize(module, permission)` guards, one per clause, built on first use. */
  const guards = new Map<
    string,
    ReturnType<typeof core.authorize>
  >();
  /** The tenant `ctx`'s checks run under, or null for global grants. */
  const tenantOf = async (ctx: RapidAccessContext): Promise<string | null> => {
    if (tenant === undefined) return null;
    const code = await tenant(ctx);
    return typeof code === 'string' && code !== '' ? code : null;
  };
  /** The grant key a check reads: `<tenant>::<module>`, or the module. */
  const keyOf = (module: M, scope: string | null): PactGrantKey<M> =>
    (scope === null ? module : `${scope}::${module}`) as PactGrantKey<M>;
  /**
   * Whether `auth` holds a `Module:PERMISSION` clause — under `scope`
   * when a tenant applies. An unknown module or permission is never
   * granted: the audit lists every clause in use, so a typo is a visible
   * denial.
   */
  const holds = async (
    auth: PactAuthContext<M, B> | undefined,
    clause: string,
    scope: string | null,
  ): Promise<boolean> => {
    const colon = clause.indexOf(':');
    if (colon <= 0 || colon === clause.length - 1) return false;
    const module = clause.slice(0, colon);
    const permission = clause.slice(colon + 1) as keyof B & string;
    if (!known(module, permission)) return false;
    if (scope !== null) {
      return auth !== undefined &&
        await auth.principal.hasPermission(keyOf(module, scope), permission);
    }
    let guard = guards.get(clause);
    if (guard === undefined) {
      guard = core.authorize(module, permission);
      guards.set(clause, guard);
    }
    return (await guard(auth)) === undefined;
  };
  /** Whether `clause` names a module and permission this instance knows. */
  const known = (
    module: string,
    permission: string,
  ): module is M =>
    pact.modules.includes(module as M) &&
    pact.getModulePermissions(module as M).map(String).includes(permission);
  const binding: RapidAuthBinding = {
    authenticate: async (ctx) => {
      const { auth, respond } = await identify(ctx);
      if (respond !== undefined) sealers.set(ctx, respond);
      return auth;
    },
    authorize: async (ctx: RapidAccessContext, access: string) => {
      const auth = ctx.auth as PactAuthContext<M, B> | undefined;
      let scope: string | null | undefined;
      for (const raw of access.split('|')) {
        const clause = raw.trim();
        if (clause === 'signed-in') {
          if (auth !== undefined) return true;
          continue;
        }
        scope ??= await tenantOf(ctx);
        if (await holds(auth, clause, scope)) return true;
      }
      return false;
    },
    finish: async (ctx) => {
      const respond = sealers.get(ctx);
      if (respond === undefined || ctx.type !== 'HTTP') return;
      sealers.delete(ctx);
      await seal(ctx, respond);
    },
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
    return async (ctx, next) => {
      const auth = ctx.auth as PactAuthContext<M, B> | undefined;
      const scope = auth === undefined ? null : await tenantOf(ctx);
      if (scope === null) {
        const denial = await guard(auth);
        if (denial !== undefined) {
          throw denied(ctx, denial, { module, permission });
        }
      } else if (
        !(await auth!.principal.hasPermission(keyOf(module, scope), permission))
      ) {
        throw new RapidError('RAPID_ACCESS_DENIED', {
          details: { module, permission, tenant: scope },
        });
      }
      return await next();
    };
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
        options: {
          ...cookieAttrs,
          maxAge: Math.min(MAX_COOKIE_AGE, session.refreshMaxAge ?? 604_800),
        },
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
    const raw = headerOf(ctx.headers, cookieOn(ctx.surface))(
      config.bearer.header,
    );
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
      // The presented refresh token is dead (reused, expired, revoked) —
      // a browser must not keep replaying it for the cookie's lifetime.
      if (session.refreshCookie !== undefined) {
        ctx.deleteCookie(session.refreshCookie, { path: cookieAttrs.path });
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

  return { binding, authorize, login, logout, refresh, me };
}

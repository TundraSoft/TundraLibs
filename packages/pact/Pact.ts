/**
 * @fileoverview The `Pact` engine — bitmask authorization kernel +
 * hook-backed identity, credentials, and sessions.
 *
 * An `Options`-based class (typed option store + `Events` emitter, the
 * TundraLibs idiom — see `RESTler`, `Norm`): config flows through the
 * option store, lifecycle through events (`_on<Event>` constructor options
 * or `.on()`), listener faults isolated by the hardened base.
 *
 * Transport boundary: pact NEVER parses headers or cookies. The framework
 * extracts credentials and passes a {@link PactCredential}; pact only
 * handles the checks and validation. All cryptography is delegated to
 * `@tundralibs/crypt`; ids/secrets come from `@tundralibs/id`; OAuth HTTP
 * runs on `@tundralibs/restler`.
 *
 * @example
 * ```ts
 * declare const db: {
 *   byEmail(email: string): Promise<
 *     { id: string; secret?: string; grants?: Record<string, string> } | null
 *   >;
 * };
 *
 * const pact = Pact.create({
 *   bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
 *   modules: { Post: ['READ', 'EDIT', 'DELETE'] },
 *   secret: 'a-256-bit-shared-secret-for-hs256!',
 *   password: true,
 *   session: { embedGrants: true },
 *   hooks: {
 *     getUser: (q) =>
 *       q.by === 'IDENTIFIER' ? db.byEmail(q.identifier) : null,
 *   },
 * });
 *
 * const result = await pact.login('password', {
 *   identifier: 'a@example.com',
 *   password: 'hunter2!hunter2!',
 * });
 * if (result !== null) {
 *   const principal = await pact.verify(result.token);
 *   pact.assert(principal, 'Post', 'EDIT');
 * }
 * ```
 *
 * @module
 */

import { constantTimeEqual, hash, hkdf } from '@tundralibs/crypt';
import { pbkdf2Hash, pbkdf2Verify } from '@tundralibs/crypt/digest';
import {
  issueJWT,
  type JWTAlgorithm,
  type JWTPayload,
  verifyJWT as cryptVerifyJWT,
} from '@tundralibs/crypt/JWT';
import { generateOTPAuthURL, verifyTOTP } from '@tundralibs/crypt/OTP';
import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';
import { nanoID } from '@tundralibs/id';
import { type EventOptionKeys, Options } from '@tundralibs/utils';
import {
  PactDefinitionError,
  PactDeniedError,
  PactTokenError,
} from './errors/mod.ts';
import { deserializeGrants, serializeGrants } from './grants.ts';
import { OAuthClient } from './oauth/mod.ts';
import { Permissions } from './Permissions.ts';
import type {
  PactAuthorizationUrlOptions,
  PactCredential,
  PactEvents,
  PactGrants,
  PactHooks,
  PactLoginResult,
  PactOAuthCallbackParams,
  PactOAuthProfile,
  PactOptions,
  PactPermissionBits,
  PactPermissionRef,
  PactPrincipal,
  PactStoredUser,
} from './types/mod.ts';

/** Default access-token / opaque-session lifetime, seconds. */
const DEFAULT_TTL_SECONDS = 3_600;
/** Default access-token lifetime once refresh rotation is on, seconds. */
const DEFAULT_TTL_WITH_REFRESH_SECONDS = 900;
/** Default refresh-family lifetime, seconds (30 days). */
const DEFAULT_REFRESH_TTL_SECONDS = 2_592_000;
/** Default rotation grace window, seconds. */
const DEFAULT_REFRESH_GRACE_SECONDS = 5;

/** Resolved session configuration (defaults applied). */
type SessionSettings = {
  strategy: 'JWT' | 'OPAQUE';
  ttl: number;
  embedGrants: boolean;
  refresh?: { ttl: number; grace: number };
};

/**
 * The pact engine: bitmask authorization kernel + hook-backed identity,
 * credentials, and sessions. Transport stays with the framework.
 *
 * @typeParam P - the permission registry type (name → bit).
 */
export class Pact<P extends PactPermissionBits = PactPermissionBits>
  extends Options<PactOptions<P>, PactEvents> {
  private readonly __permissions: Permissions<P>;
  private readonly __hooks: PactHooks;
  private readonly __oauth = new Map<string, OAuthClient>();
  /** Held OUT of the option store — `getOptions()` can never surface it. */
  private readonly __secretMaterial: PactOptions<P>['secret'];
  /** Cached domain-separated HMAC key for {@link Pact.sign}. */
  private __contentSignKey?: string;
  /** Fixed dummy pbkdf2 hash for constant-time password-miss equalization. */
  private __dummyHash?: string;

  /**
   * Build the engine. **The sole entry point** — the constructor is private,
   * so `Pact.create(options)` is the only way to construct a `Pact`. Encodes
   * the capability→hook requiredness table:
   *
   * | capability                          | required hooks                            |
   * | ----------------------------------- | ----------------------------------------- |
   * | authorization only                  | none                                      |
   * | password login / `BASIC` scheme     | getUser                                   |
   * | oauth login                         | getUser + createUser                      |
   * | `APIKEY` / `HMAC` schemes           | getApiKey + getUser                       |
   * | `TOKEN` scheme                      | getToken + getUser                        |
   * | `'OPAQUE'` strategy OR refresh on   | getSession + saveSession + deleteSession  |
   * | register / setPassword / logoutAll  | createUser / updateUser /                 |
   * |   issueApiKey / issueToken /        |   deleteUserSessions / saveApiKey /       |
   * |   enrollOtp / verifyOtp (call time) |   saveToken / updateUser / getUser        |
   *
   * `'JWT'` strategy + any session-minting login method (password, oauth,
   * strategies) also requires `secret`.
   *
   * @param options - engine configuration.
   * @returns the constructed engine.
   * @throws {@link PactDefinitionError} when `bits` is missing or JWT
   *   sessions lack `secret` (`MISSING_OPTION`), an enabled capability
   *   lacks its hook (`MISSING_HOOK`), the `secret` shape/length
   *   contradicts the algorithm (`INVALID_OPTION`), the registry is
   *   malformed (via {@link Permissions}), or an `oauth` entry is
   *   misconfigured (via {@link OAuthClient}).
   */
  static create<P extends PactPermissionBits = PactPermissionBits>(
    options: EventOptionKeys<PactOptions<P>, PactEvents>,
  ): Pact<P> {
    return new Pact<P>(options);
  }

  /** Private — build a `Pact` through {@link Pact.create}. */
  private constructor(options: EventOptionKeys<PactOptions<P>, PactEvents>) {
    super();
    // Keep the signing secret / RSA private key out of the public option
    // store; hold it privately so getOptions() can never leak it.
    const { secret, ...rest } = options;
    this.__secretMaterial = secret as PactOptions<P>['secret'];
    this._setOptions(rest as EventOptionKeys<PactOptions<P>, PactEvents>, {
      algorithm: 'HS256',
    } as Partial<PactOptions<P>>);

    const bits = this._getOption('bits');
    if (bits === undefined) {
      throw new PactDefinitionError(
        'Pact requires a `bits` permission registry',
        { code: 'MISSING_OPTION', option: 'bits' },
      );
    }
    this.__permissions = new Permissions<P>(bits, this._getOption('modules'));
    this.__hooks = this._getOption('hooks') ?? {};

    // Validate key material against the algorithm family: HS* takes one
    // shared secret string; RS* takes a PEM { privateKey, publicKey } pair.
    // RFC 7518 §3.2 binds the HMAC key floor to the hash output — HS256 ≥
    // 32 B, HS384 ≥ 48 B, HS512 ≥ 64 B.
    const s = this.__secretMaterial;
    if (s !== undefined) {
      if (this.__isHMAC()) {
        if (typeof s !== 'string') {
          throw new PactDefinitionError(
            `Algorithm '${this.__algorithm()}' takes a shared secret string, not a key pair`,
            { code: 'INVALID_OPTION', option: 'secret' },
          );
        }
        // Per-algorithm minimum = hash output size in bytes; measure UTF-8
        // bytes, not string length, so multi-byte characters count right.
        const algorithm = this.__algorithm();
        const minBytes = Number(algorithm.slice(2)) / 8;
        if (new TextEncoder().encode(s).length < minBytes) {
          throw new PactDefinitionError(
            `Algorithm '${algorithm}' needs a shared secret of at least ${minBytes} bytes (RFC 7518 §3.2)`,
            { code: 'INVALID_OPTION', option: 'secret' },
          );
        }
      } else if (typeof s === 'string') {
        throw new PactDefinitionError(
          `Algorithm '${this.__algorithm()}' requires a { privateKey, publicKey } pair`,
          { code: 'INVALID_OPTION', option: 'secret' },
        );
      }
    }

    // Capability → hook gating.
    const need = (hook: keyof PactHooks, why: string): void => {
      if (this.__hooks[hook] === undefined) {
        throw new PactDefinitionError(`${why} requires the '${hook}' hook`, {
          code: 'MISSING_HOOK',
          option: `hooks.${hook}`,
        });
      }
    };
    if (this._getOption('password')) {
      need('getUser', `The 'password' login method / 'BASIC' scheme`);
    }
    if (this._getOption('oauth') !== undefined) {
      need('getUser', 'OAuth login');
      need('createUser', 'OAuth login (first-login provisioning)');
    }
    if (this._getOption('apiKeys')) {
      need('getApiKey', `The 'APIKEY'/'HMAC' schemes`);
      need('getUser', `The 'APIKEY'/'HMAC' schemes (principal resolution)`);
    }
    if (this._getOption('tokens')) {
      need('getToken', `The 'TOKEN' scheme`);
      need('getUser', `The 'TOKEN' scheme (principal resolution)`);
    }
    const session = this._getOption('session') ?? {};
    if (session.strategy === 'OPAQUE' || session.refresh !== undefined) {
      const why = session.strategy === 'OPAQUE'
        ? `The 'OPAQUE' session strategy`
        : 'Refresh-token rotation';
      need('getSession', why);
      need('saveSession', why);
      need('deleteSession', why);
    }
    // Only session-MINTING methods need signing material; per-request
    // schemes (BASIC/TOKEN/APIKEY/HMAC) verify without it, and OPAQUE
    // sessions are store-backed rather than signed.
    const mintsSessions = Boolean(
      this._getOption('password') || this._getOption('oauth') !== undefined ||
        this._getOption('strategies') !== undefined,
    );
    if (
      mintsSessions && (session.strategy ?? 'JWT') === 'JWT' &&
      secret === undefined
    ) {
      throw new PactDefinitionError(
        `JWT sessions require the 'secret' option`,
        { code: 'MISSING_OPTION', option: 'secret' },
      );
    }

    // OAuth provider instances (each doubles as a login method).
    const oauth = this._getOption('oauth');
    if (oauth !== undefined) {
      for (const [name, config] of Object.entries(oauth)) {
        this.__oauth.set(
          name,
          new OAuthClient(
            name,
            config,
            (reason) => this._emit('idTokenUnverified', name, reason),
          ),
        );
      }
    }

    // Keep secret-bearing fields OFF enumeration surfaces — an accidental
    // `console.log(pact)` / `util.inspect` / `{...pact}` / JSON of the engine
    // must never surface the raw signing key, the derived content key, the
    // hooks, or the oauth clients (which hold a `clientSecret`).
    for (
      const key of [
        '__secretMaterial',
        '__contentSignKey',
        '__dummyHash',
        '__hooks',
        '__oauth',
      ] as const
    ) {
      Object.defineProperty(this, key, { enumerable: false });
    }
  }

  // ── authN ────────────────────────────────────────────────────────────

  /**
   * Create an account: pbkdf2-hash the password (crypt) → `createUser` →
   * principal. Emits `register`.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `createUser` hook is not wired; rethrows whatever the hook throws.
   */
  async register(input: {
    identifier: string;
    password?: string;
    grants?: Record<string, string>;
    metadata?: Record<string, unknown>;
  }): Promise<PactPrincipal> {
    // Validate caller-supplied grants up front, so a malformed value fails
    // loudly here rather than being stored and breaking every later read.
    if (input.grants !== undefined) deserializeGrants(input.grants);
    const createUser = this.__hook('createUser', 'register()');
    const stored = await createUser({
      identifier: input.identifier,
      secret: input.password !== undefined
        ? await pbkdf2Hash(input.password)
        : undefined,
      grants: input.grants,
      metadata: input.metadata,
    });
    const principal = this.__toPrincipal(stored);
    if (principal === null) {
      throw new PactDefinitionError(
        'createUser returned a user with malformed grants',
        { code: 'INVALID_GRANTS' },
      );
    }
    this._emit('register', principal);
    return principal;
  }

  /**
   * Run a session-minting login: `'password'` | an oauth instance name |
   * a custom strategy name. (Per-request credentials — api keys, simple
   * tokens, Basic, HMAC — go through {@link Pact.authenticate} instead.)
   *
   * Returns `null` for bad credentials or a non-`ACTIVE` user (emits
   * `loginFailed` with no error); operational failures emit `loginFailed`
   * with the error and rethrow. Success issues the session token(s) and
   * emits `login`. On OAuth logins the fresh verified profile — including
   * scope-dependent claims — rides `result.profile` on EVERY login, so
   * the app can sync updated claims into its own store.
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_STRATEGY`) when nothing
   *   is named `method`; rethrows strategy/OAuth/hook operational errors
   *   (e.g. {@link PactOAuthError}) after emitting `loginFailed`.
   */
  async login(
    method: string,
    credentials: unknown,
  ): Promise<PactLoginResult | null> {
    const isPassword = method === 'password' &&
      Boolean(this._getOption('password'));
    const oauthClient = this.__oauth.get(method);
    const strategy = this._getOption('strategies')?.[method];
    if (!isPassword && oauthClient === undefined && strategy === undefined) {
      throw new PactDefinitionError(
        `No login method, strategy, or OAuth provider named '${method}'`,
        { code: 'UNKNOWN_STRATEGY', strategy: method },
      );
    }
    try {
      let user: PactStoredUser | null;
      let isNew = false;
      let profile: PactOAuthProfile | undefined;
      if (isPassword) {
        user = await this.__passwordUser(credentials);
        if (user === null) return this.__loginFail(method);
      } else if (oauthClient !== undefined) {
        profile = await oauthClient.callback(
          credentials as PactOAuthCallbackParams,
        );
        const getUser = this.__hook('getUser', 'OAuth login');
        user = await getUser({
          by: 'OAUTH',
          provider: method,
          subject: profile.id,
        });
        if (user === null) {
          // First federated login — the app decides link-vs-create inside
          // its createUser hook (it sees the full verified profile).
          const createUser = this.__hook('createUser', 'OAuth login');
          user = await createUser({
            oauth: { provider: method, subject: profile.id, profile },
          });
          isNew = true;
        }
      } else {
        const result = await strategy!(credentials);
        if (!result.ok) return this.__loginFail(method);
        user = result.user;
        isNew = result.isNew ?? false;
      }
      const principal = this.__resolvePrincipal(user);
      if (principal === null) return this.__loginFail(method);
      const session = await this.__issueSession(principal);
      const result: PactLoginResult = {
        principal,
        ...session,
        isNew,
        ...(profile !== undefined ? { profile } : {}),
      };
      this._emit('login', method, principal, isNew);
      return result;
    } catch (error) {
      this._emit('loginFailed', method, error as Error);
      throw error;
    }
  }

  /**
   * Verify a pact-ISSUED session token → principal. THE core primitive.
   *
   * - `'JWT'`: crypt verifyJWT (algorithm pinned, `iss`/`aud` enforced) →
   *   the `use` claim must be `'ACCESS'` (a refresh token never passes) →
   *   the `isRevoked` seam → principal from embedded grants, or a fresh
   *   `getUser({by:'ID'})` (which also re-checks `status`).
   * - `'OPAQUE'`: `getSession(token)` → expiry/`revokedAt` gate →
   *   `getUser({by:'ID'})`.
   *
   * Resolves `null` for EVERY bad-token outcome (bad signature/claims,
   * wrong type, revoked, dead session, unknown user, non-`ACTIVE` user),
   * emitting `verifyFailed` with the typed error — so
   * {@link Pact.authenticate} keeps a uniform `null` contract. Throws
   * only for configuration errors.
   *
   * Note: with `embedGrants` the principal is rebuilt from the token —
   * grants AND status changes are invisible until the (short) expiry.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the `'OPAQUE'`
   *   strategy is used without its session hooks wired. A missing `secret`
   *   is NOT thrown — it resolves `null` (with `verifyFailed`), keeping the
   *   uniform bad-token contract; wire `secret` when minting JWT sessions.
   */
  async verify(token: string): Promise<PactPrincipal | null> {
    const cfg = this.__session();
    if (cfg.strategy === 'OPAQUE') {
      const getSession = this.__hook('getSession', `The 'OPAQUE' strategy`);
      // The opaque token is a bearer secret — it is stored, and looked up, by
      // its sha-256 (never in plaintext), so a store leak yields no usable id.
      const session = await getSession(await this.__sessionKey(token));
      if (
        session === null || session.revokedAt !== undefined ||
        !this.__isLive(session.expiresAt)
      ) {
        return this.__verifyFail(
          new PactTokenError('Session is missing, revoked, or expired', {
            code: 'TOKEN_REVOKED',
          }),
          token,
        );
      }
      return await this.__principalById(session.userId);
    }
    // JWT strategy.
    let claims: JWTPayload;
    try {
      claims = await cryptVerifyJWT(token, this.__verifyKey(), {
        algorithm: this.__algorithm(),
        ...(this._getOption('issuer') !== undefined
          ? { iss: this._getOption('issuer') }
          : {}),
        ...(this._getOption('audience') !== undefined
          ? { aud: this._getOption('audience') }
          : {}),
      });
    } catch (error) {
      return this.__verifyFail(error as Error, token);
    }
    if ((claims as { use?: unknown }).use !== 'ACCESS') {
      return this.__verifyFail(
        new PactTokenError('Token is not an access token', {
          code: 'TOKEN_TYPE_MISMATCH',
        }),
        token,
      );
    }
    const isRevoked = this.__hooks.isRevoked;
    if (isRevoked !== undefined && await isRevoked(claims)) {
      return this.__verifyFail(
        new PactTokenError('Token has been revoked', {
          code: 'TOKEN_REVOKED',
        }),
        token,
      );
    }
    const sub = String(claims.sub);
    if (cfg.embedGrants) {
      const wire = (claims as { grants?: unknown }).grants;
      let grants: PactGrants = {};
      if (typeof wire === 'object' && wire !== null) {
        try {
          grants = deserializeGrants(wire as Record<string, string>);
        } catch {
          return this.__verifyFail(
            new PactTokenError('Embedded grants are malformed', {
              code: 'TOKEN_REVOKED',
            }),
            token,
          );
        }
      }
      return { id: sub, grants, status: 'ACTIVE', metadata: {} };
    }
    return await this.__principalById(sub);
  }

  /**
   * Middleware #1: check ONE extracted credential → principal (or
   * `null`). pact never sees headers/cookies — the framework extracts and
   * passes a {@link PactCredential}. Non-`ACTIVE` users resolve `null`.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   scheme's hooks are not wired.
   */
  async authenticate(
    credential: PactCredential,
  ): Promise<PactPrincipal | null> {
    switch (credential.scheme) {
      case 'BASIC': {
        const getUser = this.__hook('getUser', `The 'BASIC' scheme`);
        const user = await getUser({
          by: 'IDENTIFIER',
          identifier: credential.identifier,
        });
        if (user === null || user.secret === undefined) {
          // Pay the KDF cost even on a miss so a valid identifier can't be
          // distinguished from an absent one by response latency.
          await this.__equalizeTiming(credential.password);
          return null;
        }
        if (!await pbkdf2Verify(credential.password, user.secret)) {
          return null;
        }
        return this.__resolvePrincipal(user);
      }
      case 'BEARER':
        return await this.verify(credential.token);
      case 'TOKEN': {
        const getToken = this.__hook('getToken', `The 'TOKEN' scheme`);
        const record = await getToken(await hash(credential.token));
        if (record === null || record.revokedAt !== undefined) return null;
        if (
          record.expiresAt !== undefined && record.expiresAt <= Date.now()
        ) {
          return null;
        }
        return await this.__principalById(record.userId, record.grants);
      }
      case 'APIKEY': {
        const getApiKey = this.__hook('getApiKey', `The 'APIKEY' scheme`);
        const record = await getApiKey(credential.keyId);
        if (
          record === null || record.revokedAt !== undefined ||
          record.secretHash === undefined
        ) {
          return null;
        }
        const presented = await hash(credential.secret);
        if (!constantTimeEqual(presented, record.secretHash)) return null;
        return await this.__principalById(record.userId, record.grants);
      }
      case 'HMAC': {
        const getApiKey = this.__hook('getApiKey', `The 'HMAC' scheme`);
        const record = await getApiKey(credential.keyId);
        // HMAC verification needs the stored secret itself — a hash-only
        // (presented-style) key cannot verify signatures.
        if (
          record === null || record.revokedAt !== undefined ||
          record.secret === undefined
        ) {
          return null;
        }
        let ok = false;
        try {
          ok = await verifyHMAC(
            credential.payload,
            credential.signature,
            record.secret,
          );
        } catch {
          // A malformed attacker-supplied signature (empty / non-hex) makes
          // crypt's verifyHMAC throw — resolve to null, never a 500. Same
          // guard the sibling verifySignature() already applies.
          return null;
        }
        if (!ok) return null;
        return await this.__principalById(record.userId, record.grants);
      }
      default:
        // Unreachable for a well-typed caller; a JS caller passing an
        // unrecognized scheme gets a clean null, never `undefined`.
        return null;
    }
  }

  /**
   * Rotate a refresh token: verify (the `use` claim must be `'REFRESH'`)
   * → load the family → generation check → rotate (`generation + 1`) →
   * fresh access+refresh pair.
   *
   * A generation match rotates. The immediately-previous generation
   * within the `grace` window re-issues at the CURRENT generation
   * (absorbing a legitimate concurrent refresh). Anything else is a
   * replay: the family is tombstoned, `refreshReuse` fires, and `null`
   * is returned. All other bad-token outcomes also resolve `null` with
   * `verifyFailed`.
   *
   * @throws {@link PactDefinitionError} when refresh rotation is not
   *   configured (`MISSING_OPTION`) or its hooks are missing
   *   (`MISSING_HOOK`).
   */
  async refresh(refreshToken: string): Promise<PactLoginResult | null> {
    const cfg = this.__session();
    if (cfg.strategy !== 'JWT' || cfg.refresh === undefined) {
      throw new PactDefinitionError(
        `refresh() requires the 'JWT' strategy with 'session.refresh' configured`,
        { code: 'MISSING_OPTION', option: 'session.refresh' },
      );
    }
    let claims: JWTPayload;
    try {
      claims = await cryptVerifyJWT(refreshToken, this.__verifyKey(), {
        algorithm: this.__algorithm(),
        ...(this._getOption('issuer') !== undefined
          ? { iss: this._getOption('issuer') }
          : {}),
        ...(this._getOption('audience') !== undefined
          ? { aud: this._getOption('audience') }
          : {}),
      });
    } catch (error) {
      return this.__verifyFail(error as Error, refreshToken);
    }
    const sid = (claims as { sid?: unknown }).sid;
    const gen = (claims as { gen?: unknown }).gen;
    if (
      (claims as { use?: unknown }).use !== 'REFRESH' ||
      typeof sid !== 'string' || typeof gen !== 'number'
    ) {
      return this.__verifyFail(
        new PactTokenError('Token is not a refresh token', {
          code: 'TOKEN_TYPE_MISMATCH',
        }),
        refreshToken,
      );
    }
    // The `isRevoked` denylist governs the refresh path too, not just verify()
    // — a denylisted token must not be able to mint a fresh access pair.
    const isRevoked = this.__hooks.isRevoked;
    if (isRevoked !== undefined && await isRevoked(claims)) {
      return this.__verifyFail(
        new PactTokenError('Token has been revoked', { code: 'TOKEN_REVOKED' }),
        refreshToken,
      );
    }
    const getSession = this.__hook('getSession', 'Refresh rotation');
    const saveSession = this.__hook('saveSession', 'Refresh rotation');
    const session = await getSession(sid);
    if (
      session === null || session.revokedAt !== undefined ||
      !this.__isLive(session.expiresAt)
    ) {
      return this.__verifyFail(
        new PactTokenError(
          'Refresh family is missing, revoked, or expired',
          { code: 'TOKEN_REVOKED' },
        ),
        refreshToken,
      );
    }
    const current = session.generation ?? 0;
    const now = Date.now();
    if (gen === current) {
      // Normal rotation.
      await saveSession({
        ...session,
        generation: current + 1,
        rotatedAt: now,
      });
      return await this.__reissue(
        session.userId,
        sid,
        current + 1,
        session.expiresAt,
      );
    }
    if (
      gen === current - 1 && session.rotatedAt !== undefined &&
      // Strict `<` so `grace: 0` is truly strict — a same-millisecond
      // replay must not slip through as `0 <= 0`.
      now - session.rotatedAt < cfg.refresh.grace * 1_000
    ) {
      // A legitimate concurrent refresh raced the rotation — re-issue at
      // the CURRENT generation without advancing it.
      return await this.__reissue(
        session.userId,
        sid,
        current,
        session.expiresAt,
      );
    }
    // Replay: a stale (or impossible) generation. Kill the whole family —
    // the thief and the victim both lose their tokens.
    await saveSession({ ...session, revokedAt: now });
    this._emit('refreshReuse', session.userId, sid);
    return null;
  }

  /**
   * Kill one session/family. `'OPAQUE'`: delete the session — immediate.
   * `'JWT'` with refresh: delete the family (the token may be the access
   * OR the refresh token — both carry the family `sid`) — the refresh
   * path dies instantly, the access token at its (short) expiry. A
   * stateless JWT without refresh has nothing to kill — the call is a
   * no-op (use a short `ttl`). Invalid tokens are ignored (logout is
   * idempotent). Emits `logout` when something was ended.
   */
  async logout(token: string): Promise<void> {
    const cfg = this.__session();
    if (cfg.strategy === 'OPAQUE') {
      const getSession = this.__hook('getSession', `The 'OPAQUE' strategy`);
      const deleteSession = this.__hook(
        'deleteSession',
        `The 'OPAQUE' strategy`,
      );
      const key = await this.__sessionKey(token);
      const session = await getSession(key);
      if (session === null) return;
      await deleteSession(key);
      this._emit('logout', session.userId, this.__redact(token));
      return;
    }
    if (cfg.refresh === undefined) return; // stateless — nothing to kill
    let claims: JWTPayload;
    try {
      claims = await cryptVerifyJWT(token, this.__verifyKey(), {
        algorithm: this.__algorithm(),
      });
    } catch {
      return; // idempotent — an invalid token has nothing to end
    }
    const sid = (claims as { sid?: unknown }).sid;
    if (typeof sid !== 'string') return;
    const deleteSession = this.__hook('deleteSession', 'Refresh rotation');
    await deleteSession(sid);
    this._emit('logout', String(claims.sub), sid);
  }

  /**
   * Kill every session/family for a user. Emits `logout`.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `deleteUserSessions` hook is not wired.
   */
  async logoutAll(userId: string): Promise<void> {
    const deleteUserSessions = this.__hook(
      'deleteUserSessions',
      'logoutAll()',
    );
    await deleteUserSessions(userId);
    this._emit('logout', userId);
  }

  /**
   * pbkdf2-hash via crypt → `updateUser({secret})`. Apps never hash.
   *
   * Does **not** invalidate existing sessions or refresh families — a
   * password change leaves already-issued tokens live. Call
   * {@link Pact.logoutAll} afterwards if a reset must end other sessions.
   * Authorizing the caller (proving the actor may change *this* `userId`) is
   * the app's responsibility — never pass a `userId` straight from request
   * input.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `updateUser` hook is not wired.
   */
  async setPassword(userId: string, password: string): Promise<void> {
    const updateUser = this.__hook('updateUser', 'setPassword()');
    await updateUser(userId, { secret: await pbkdf2Hash(password) });
  }

  // ── mfa (secondary verification; seed on the stored user) ────────────

  /**
   * Enroll a user for TOTP: generate a seed → `updateUser({otpSecret})` →
   * return the seed + otpauth URL (crypt) for the QR code. The APP
   * decides when to demand the second step after `login()`.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `updateUser` hook is not wired.
   */
  async enrollOtp(
    userId: string,
    options: { accountName: string; issuer?: string },
  ): Promise<{ secret: string; url: string }> {
    const updateUser = this.__hook('updateUser', 'enrollOtp()');
    // crypt interprets the seed identically in generateOTPAuthURL and
    // verifyTOTP (canonical base32 → decoded, else UTF-8), so a nanoID
    // passphrase is consistent on both sides.
    const secret = nanoID(32);
    await updateUser(userId, { otpSecret: secret });
    const url = generateOTPAuthURL({
      type: 'totp',
      secret,
      accountName: options.accountName,
      issuer: options.issuer ?? this._getOption('issuer') ?? 'pact',
    });
    return { secret, url };
  }

  /**
   * Check a TOTP code against the user's stored seed (secondary
   * verification — no login state machine). `false` when the user is
   * missing, not enrolled (`otpSecret` absent), non-`ACTIVE`, or the
   * code is wrong.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `getUser` hook is not wired.
   */
  async verifyOtp(userId: string, code: string): Promise<boolean> {
    const getUser = this.__hook('getUser', 'verifyOtp()');
    const user = await getUser({ by: 'ID', id: userId });
    if (
      user === null || user.otpSecret === undefined ||
      (user.status ?? 'ACTIVE') !== 'ACTIVE'
    ) {
      return false;
    }
    return await verifyTOTP(code, user.otpSecret);
  }

  // ── authZ (middleware #2 / guards) ───────────────────────────────────

  /**
   * True when the principal is `ACTIVE` and its effective grants include
   * `permission` on `module`.
   *
   * @throws {@link PactDefinitionError} on catalog validation (unknown
   *   module / permission) via {@link Permissions.has}.
   */
  can(
    principal: PactPrincipal | null,
    module: string,
    permission: PactPermissionRef<P>,
  ): boolean {
    if (principal === null || principal.status !== 'ACTIVE') return false;
    return this.__permissions.has(module, permission, principal.grants);
  }

  /**
   * Guard form of {@link Pact.can} — emits `denied` and throws on
   * failure.
   *
   * @throws {@link PactDeniedError} when the check fails — the framework
   *   maps it to 401/403.
   * @throws {@link PactDefinitionError} on catalog validation (unknown
   *   module / permission) via {@link Permissions.has}.
   */
  assert(
    principal: PactPrincipal | null,
    module: string,
    permission: PactPermissionRef<P>,
  ): void {
    if (this.can(principal, module, permission)) return;
    this._emit('denied', principal, module, permission);
    throw new PactDeniedError(module, String(permission));
  }

  // ── oauth / api keys / tokens ────────────────────────────────────────

  /**
   * Start an OAuth flow: returns the redirect `url` plus the `state`,
   * PKCE `verifier`, AND OIDC `nonce` the consumer must hold
   * (session/cookie) until the callback. Complete with
   * `login('<instance>', { code, verifier, expectedState, expectedNonce })`.
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_STRATEGY`) for an
   *   unknown `provider`; {@link PactOAuthError} on discovery failure.
   */
  oauthRedirect(
    provider: string,
    options?: PactAuthorizationUrlOptions,
  ): Promise<
    { url: string; state: string; verifier: string; nonce: string }
  > {
    const client = this.__oauth.get(provider);
    if (client === undefined) {
      throw new PactDefinitionError(
        `No OAuth instance named '${provider}'`,
        { code: 'UNKNOWN_STRATEGY', strategy: provider },
      );
    }
    return client.authorizationUrl(options);
  }

  /**
   * Mint an `<prefix>_ak_/_sk_` pair (nanoID) → sha-256 hash (crypt) →
   * `saveApiKey`. The secret is shown ONCE and never stored. (HMAC
   * signing keys store the secret itself — create those app-side.)
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `saveApiKey` hook is not wired.
   */
  async issueApiKey(
    userId: string,
    options?: { grants?: PactGrants },
  ): Promise<{ id: string; secret: string }> {
    const saveApiKey = this.__hook('saveApiKey', 'issueApiKey()');
    const apiKeys = this._getOption('apiKeys');
    const prefix = (typeof apiKeys === 'object' ? apiKeys.prefix : undefined) ??
      'pact';
    const id = `${prefix}_ak_${nanoID(16)}`;
    const secret = `${prefix}_sk_${nanoID(32)}`;
    await saveApiKey({
      id,
      userId,
      secretHash: await hash(secret),
      grants: options?.grants !== undefined
        ? serializeGrants(options.grants)
        : undefined,
    });
    return { id, secret };
  }

  /**
   * Mint a simple static token (`<prefix>_tk_…`, nanoID) → store only its
   * sha-256 via `saveToken`. Shown ONCE.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `saveToken` hook is not wired.
   */
  async issueToken(
    userId: string,
    options?: { grants?: PactGrants; expiresAt?: number },
  ): Promise<{ token: string }> {
    const saveToken = this.__hook('saveToken', 'issueToken()');
    const tokens = this._getOption('tokens');
    const prefix = (typeof tokens === 'object' ? tokens.prefix : undefined) ??
      'pact';
    const token = `${prefix}_tk_${nanoID(32)}`;
    await saveToken({
      hash: await hash(token),
      userId,
      grants: options?.grants !== undefined
        ? serializeGrants(options.grants)
        : undefined,
      expiresAt: options?.expiresAt,
    });
    return { token };
  }

  // ── content signing (HMAC via crypt) ─────────────────────────────────

  /**
   * HMAC-sign arbitrary content — signed API responses, webhook payloads,
   * signed URLs. With no `key`, pact derives one from the configured
   * `secret` via **HKDF** under a distinct domain label — *not* the raw
   * JWT signing secret — so a content signature can never be replayed as a
   * JWT signature. Pass an explicit `key` to sign with your own (required
   * when pact holds an RSA key pair, which carries no shared HMAC secret).
   *
   * @param content - the content to sign
   * @param key - optional explicit HMAC key
   * @returns the base64 signature
   * @throws {@link PactDefinitionError} (`MISSING_OPTION`) when no `key` is
   *   given and pact has no shared `secret` (or holds an RSA key pair).
   */
  async sign(content: string | Uint8Array, key?: string): Promise<string> {
    return await signHMAC(content, key ?? await this.__contentKey());
  }

  /**
   * Verify an HMAC signature produced by {@link Pact.sign} (same key
   * derivation; pass the same explicit `key` if you signed with one). A
   * malformed or garbage signature resolves to `false` rather than
   * throwing, so an attacker-supplied header can never 500 the caller.
   *
   * @param content - the signed content
   * @param signature - the signature to check
   * @param key - optional explicit HMAC key (see {@link Pact.sign})
   * @throws {@link PactDefinitionError} (`MISSING_OPTION`) when no `key` is
   *   given and pact has no shared `secret` (or holds an RSA key pair).
   */
  async verifySignature(
    content: string | Uint8Array,
    signature: string,
    key?: string,
  ): Promise<boolean> {
    // Resolve the key OUTSIDE the guard so a genuine config error (no
    // shared secret) still throws; a malformed/garbage signature
    // (attacker-supplied) resolves to a clean `false`, never a 500.
    const signingKey = key ?? await this.__contentKey();
    try {
      return await verifyHMAC(content, signature, signingKey);
    } catch {
      return false;
    }
  }

  /**
   * HMAC-sign `content` with the *same* secret behind API key `keyId` —
   * for a server responding to an `HMAC`-authenticated caller, so that
   * caller (and only that caller) can verify the response with the secret
   * they already hold. Unlike {@link Pact.sign}, this never hands the
   * secret itself back to the caller; it re-fetches the key record via
   * `getApiKey` and signs internally. Resolves `null` — never throws — for
   * an unknown, revoked, or presented-secret-only (no `secret`) key, the
   * same never-throw contract {@link Pact.authenticate}'s `HMAC` case uses.
   *
   * @param keyId - the API key whose secret signs `content`
   * @param content - the content to sign
   * @returns the base64 signature, or `null` when `keyId` can't sign
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when the
   *   `getApiKey` hook is not wired.
   */
  async signAs(
    keyId: string,
    content: string | Uint8Array,
  ): Promise<string | null> {
    const getApiKey = this.__hook('getApiKey', 'signAs()');
    const record = await getApiKey(keyId);
    if (
      record === null || record.revokedAt !== undefined ||
      record.secret === undefined
    ) {
      return null;
    }
    return await signHMAC(content, record.secret);
  }

  // ── power-user escape hatch ──────────────────────────────────────────

  /** The raw bitmask engine (mask math lives here + in `./authz`). */
  get authz(): Permissions<P> {
    return this.__permissions;
  }

  // ── internals ────────────────────────────────────────────────────────

  /**
   * A wired hook, or throw.
   *
   * @throws {@link PactDefinitionError} (`MISSING_HOOK`) when `hook` is
   *   not configured.
   */
  private __hook<K extends keyof PactHooks>(
    hook: K,
    why: string,
  ): NonNullable<PactHooks[K]> {
    const fn = this.__hooks[hook];
    if (fn === undefined) {
      throw new PactDefinitionError(`${why} requires the '${hook}' hook`, {
        code: 'MISSING_HOOK',
        option: `hooks.${hook}`,
      });
    }
    return fn;
  }

  /** Resolved session settings with defaults applied. */
  private __session(): SessionSettings {
    const cfg = this._getOption('session') ?? {};
    const refresh = cfg.refresh !== undefined
      ? {
        ttl: cfg.refresh.ttl ?? DEFAULT_REFRESH_TTL_SECONDS,
        grace: cfg.refresh.grace ?? DEFAULT_REFRESH_GRACE_SECONDS,
      }
      : undefined;
    return {
      strategy: cfg.strategy ?? 'JWT',
      ttl: cfg.ttl ??
        (refresh !== undefined
          ? DEFAULT_TTL_WITH_REFRESH_SECONDS
          : DEFAULT_TTL_SECONDS),
      embedGrants: cfg.embedGrants ?? false,
      refresh,
    };
  }

  /** Mint the session token(s) for a principal. */
  private async __issueSession(
    principal: PactPrincipal,
  ): Promise<{ token: string; refreshToken?: string; expiresAt: number }> {
    const cfg = this.__session();
    const now = Date.now();
    if (cfg.strategy === 'OPAQUE') {
      const saveSession = this.__hook(
        'saveSession',
        `The 'OPAQUE' strategy`,
      );
      const token = nanoID(32);
      const expiresAt = now + cfg.ttl * 1_000;
      // Store the session under sha-256(token): the raw token is the bearer
      // secret and is never persisted (mirrors the TOKEN scheme), so a store
      // leak yields no usable session id.
      await saveSession({
        id: await this.__sessionKey(token),
        userId: principal.id,
        expiresAt,
      });
      return { token, expiresAt };
    }
    if (cfg.refresh === undefined) {
      const expiresAt = now + cfg.ttl * 1_000;
      const token = await this.__mintAccess(principal, cfg, undefined);
      return { token, expiresAt };
    }
    // Refresh rotation: create the family, then bind both tokens to it.
    const saveSession = this.__hook('saveSession', 'Refresh rotation');
    const sid = nanoID(24);
    const familyExpiresAt = now + cfg.refresh.ttl * 1_000;
    await saveSession({
      id: sid,
      userId: principal.id,
      expiresAt: familyExpiresAt,
      generation: 0,
      rotatedAt: now,
    });
    const expiresAt = now + cfg.ttl * 1_000;
    const token = await this.__mintAccess(principal, cfg, sid);
    const refreshToken = await this.__mintRefresh(
      principal.id,
      sid,
      0,
      familyExpiresAt,
    );
    return { token, refreshToken, expiresAt };
  }

  /** Fresh access+refresh pair for an existing family (rotation). */
  private async __reissue(
    userId: string,
    sid: string,
    generation: number,
    familyExpiresAt: number,
  ): Promise<PactLoginResult | null> {
    const principal = await this.__principalById(userId);
    if (principal === null) return null;
    const cfg = this.__session();
    const token = await this.__mintAccess(principal, cfg, sid);
    const refreshToken = await this.__mintRefresh(
      userId,
      sid,
      generation,
      familyExpiresAt,
    );
    return {
      principal,
      token,
      refreshToken,
      expiresAt: Date.now() + cfg.ttl * 1_000,
      isNew: false,
    };
  }

  /** Mint the short-lived access JWT (`use: 'ACCESS'`). */
  private __mintAccess(
    principal: PactPrincipal,
    cfg: SessionSettings,
    sid: string | undefined,
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1_000);
    return issueJWT(this.__algorithm(), {
      sub: principal.id,
      use: 'ACCESS',
      iat: now,
      exp: now + cfg.ttl,
      ...(this._getOption('issuer') !== undefined
        ? { iss: this._getOption('issuer') }
        : {}),
      ...(this._getOption('audience') !== undefined
        ? { aud: this._getOption('audience') }
        : {}),
      ...(sid !== undefined ? { sid } : {}),
      ...(cfg.embedGrants ? { grants: serializeGrants(principal.grants) } : {}),
    }, this.__signKey());
  }

  /** Mint the rotating refresh JWT (`use: 'REFRESH'`, family + gen). */
  private __mintRefresh(
    userId: string,
    sid: string,
    generation: number,
    familyExpiresAt: number,
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1_000);
    return issueJWT(this.__algorithm(), {
      sub: userId,
      use: 'REFRESH',
      sid,
      gen: generation,
      iat: now,
      exp: Math.floor(familyExpiresAt / 1_000),
      ...(this._getOption('issuer') !== undefined
        ? { iss: this._getOption('issuer') }
        : {}),
      ...(this._getOption('audience') !== undefined
        ? { aud: this._getOption('audience') }
        : {}),
    }, this.__signKey());
  }

  /** Password-credential check → stored user, or `null`. */
  private async __passwordUser(
    credentials: unknown,
  ): Promise<PactStoredUser | null> {
    const password = this._getOption('password');
    const field =
      (typeof password === 'object' ? password.identifierField : undefined) ??
        'identifier';
    const bag = credentials as Record<string, unknown> | null | undefined;
    const identifier = bag?.[field];
    const supplied = bag?.password;
    if (typeof identifier !== 'string' || typeof supplied !== 'string') {
      return null;
    }
    const getUser = this.__hook('getUser', `The 'password' login method`);
    const user = await getUser({ by: 'IDENTIFIER', identifier });
    if (user === null || user.secret === undefined) {
      await this.__equalizeTiming(supplied);
      return null;
    }
    if (!await pbkdf2Verify(supplied, user.secret)) return null;
    return user;
  }

  /** Emit `loginFailed` (bad credentials, no error) and resolve `null`. */
  private __loginFail(method: string): null {
    this._emit('loginFailed', method);
    return null;
  }

  /**
   * Emit `verifyFailed` with the typed error and resolve `null`. The token
   * is REDACTED first (see {@link Pact.__redact}) so an audit listener that
   * logs the event never records a usable credential.
   */
  private __verifyFail(error: Error, token: string): null {
    this._emit('verifyFailed', error, this.__redact(token));
    return null;
  }

  /**
   * Redact a token for events/logs: drop a JWT's signature segment (the
   * secret part; the header/payload stay for correlation), mask an opaque
   * bearer id entirely.
   */
  private __redact(token: string): string {
    const parts = token.split('.');
    return parts.length === 3
      ? `${parts[0]}.${parts[1]}.<redacted>`
      : `<redacted:${token.length}>`;
  }

  /** A store timestamp is live only when it is a finite, future epoch-ms. */
  private __isLive(expiresAt: unknown): boolean {
    return typeof expiresAt === 'number' && Number.isFinite(expiresAt) &&
      expiresAt > Date.now();
  }

  /**
   * Burn one pbkdf2 verification against a fixed dummy hash so an absent or
   * secret-less account costs the same as a real one — closes the
   * user-enumeration timing oracle on the password paths.
   */
  private async __equalizeTiming(supplied: string): Promise<void> {
    this.__dummyHash ??= await pbkdf2Hash('pact-timing-equalizer');
    await pbkdf2Verify(supplied, this.__dummyHash);
  }

  /** sha-256 of an opaque bearer token — the at-rest session lookup key. */
  private __sessionKey(token: string): Promise<string> {
    return hash(token);
  }

  /**
   * Stored user → runtime principal, or `null` when its stored grants are
   * corrupt (a value that violates the decimal wire contract — hex, empty, a
   * NULL, a float — must deny, not 500 the read path).
   */
  private __toPrincipal(user: PactStoredUser): PactPrincipal | null {
    let grants: PactGrants;
    try {
      grants = user.grants !== undefined ? deserializeGrants(user.grants) : {};
    } catch {
      return null;
    }
    return {
      id: user.id,
      grants,
      status: user.status ?? 'ACTIVE',
      metadata: user.metadata ?? {},
    };
  }

  /** Principal for an authenticated user — non-`ACTIVE`/corrupt → `null`. */
  private __resolvePrincipal(
    user: PactStoredUser,
    grantsOverride?: Record<string, string>,
  ): PactPrincipal | null {
    const principal = this.__toPrincipal(user);
    if (principal === null || principal.status !== 'ACTIVE') return null;
    if (grantsOverride !== undefined) {
      try {
        principal.grants = deserializeGrants(grantsOverride);
      } catch {
        return null;
      }
    }
    return principal;
  }

  /** Fetch by id and resolve — the TOKEN/APIKEY/HMAC/session path. */
  private async __principalById(
    userId: string,
    grantsOverride?: Record<string, string>,
  ): Promise<PactPrincipal | null> {
    const getUser = this.__hook('getUser', 'Principal resolution');
    const user = await getUser({ by: 'ID', id: userId });
    if (user === null) return null;
    return this.__resolvePrincipal(user, grantsOverride);
  }

  /** The configured algorithm (defaulted at construction). */
  private __algorithm(): JWTAlgorithm {
    return this._getOption('algorithm') ?? 'HS256';
  }

  /** True for the symmetric (`HS*`) family. */
  private __isHMAC(): boolean {
    return this.__algorithm().startsWith('HS');
  }

  /** Key material, or throw `MISSING_OPTION` when not configured. */
  private __secret(): NonNullable<PactOptions<P>['secret']> {
    if (this.__secretMaterial === undefined) {
      throw new PactDefinitionError(
        'Token operations require the `secret` option',
        { code: 'MISSING_OPTION', option: 'secret' },
      );
    }
    return this.__secretMaterial;
  }

  /** Signing key: the shared secret (HS*) or the PEM private key (RS*). */
  private __signKey(): string {
    const secret = this.__secret();
    return typeof secret === 'string' ? secret : secret.privateKey;
  }

  /** Verify key: the shared secret (HS*) or the PEM public key (RS*). */
  private __verifyKey(): string {
    const secret = this.__secret();
    return typeof secret === 'string' ? secret : secret.publicKey;
  }

  /** Shared secret for content signing — RSA pairs have none. */
  private __hmacSecret(): string {
    const secret = this.__secret();
    if (typeof secret !== 'string') {
      throw new PactDefinitionError(
        'HMAC signing needs a shared secret string — an RSA key pair is configured; pass a key explicitly',
        { code: 'MISSING_OPTION', option: 'secret' },
      );
    }
    return secret;
  }

  /**
   * Domain-separated HMAC key for {@link Pact.sign} /
   * {@link Pact.verifySignature}, derived once from the shared secret via
   * **HKDF** (RFC 5869) under a distinct `info` label. Because it is
   * `HKDF(secret, 'pact:content-sign')` — never the raw secret — an attacker
   * who controls signed content cannot produce a valid HS\* JWT signature
   * (which is HMAC over `base64url(header).base64url(payload)` under the raw
   * secret).
   */
  private async __contentKey(): Promise<string> {
    if (this.__contentSignKey === undefined) {
      const derived = await hkdf(this.__hmacSecret(), {
        info: 'pact:content-sign',
      });
      this.__contentSignKey = toHex(derived);
    }
    return this.__contentSignKey;
  }
}

/** Hex-encode bytes — HKDF output → a string key for crypt's `signHMAC`. */
const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

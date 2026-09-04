import { pbkdf2Hash, pbkdf2Verify, sha256 } from '@tundralibs/crypt/digest';
import {
  generateBase32Secret,
  generateHexSecret,
} from '@tundralibs/crypt/generators';
import { generateOTPAuthURL } from '@tundralibs/crypt/OTP';
import { type EventOptionKeys, Options } from '@tundralibs/utils';
import { AbstractEngine, Cacher } from '@tundralibs/cacher';
import type {
  ModulePermissions,
  PactCacheConfig,
  PactCacheType,
  PactEvents,
  PactHooks,
  PactLoginResult,
  PactOptions,
  PactPrincipal,
  PactStoredSession,
  PactStoredUser,
  PermissionBits,
} from './types/mod.ts';
import type {
  PactOAuthProfile,
  PactOAuthRedirect,
} from './types/mod.ts';
import { PactError } from './errors/mod.ts';
import { deserializeGrants, serializeGrants } from './grants.ts';
import { OAuthClient } from './oauth/mod.ts';
import {
  decodeFromCache,
  encodeForCache,
  MAX_TTL_MINUTES,
  NS_SEP,
  PACT_CACHE_TYPES,
} from './cache.ts';

export class Pact<B extends PermissionBits, M extends string>
  extends Options<PactOptions, PactEvents> {
  public readonly bits: Readonly<B>;
  // Derived from modulePermissions keys — a module exists iff it declares
  // its permission ceiling.
  public readonly modules: readonly M[];
  // Resolved at construction: module -> OR-ed mask of its allowed bits.
  // Partial only for wide M (dynamic definitions); with a literal definition
  // every module has a mask by construction.
  public readonly moduleMasks: Readonly<Partial<Record<M, bigint>>>;

  // App-defined lifecycle statuses permitted to authenticate/authorize;
  // any status outside this list is fail-closed at resolution.
  public readonly activeStatuses: readonly string[];
  private readonly __activeStatusSet: ReadonlySet<string>;

  // Bring-your-own-storage seams — see PactHooks.
  protected readonly _hooks: Readonly<PactHooks<M>>;

  // One client per configured oauth instance, built eagerly so config
  // errors surface at construction rather than first login.
  private readonly __oauth: ReadonlyMap<string, OAuthClient>;

  // Per-type cacher instances, created eagerly (so config errors surface
  // at construction) for exactly the types with a positive TTL — all
  // three on MEMORY by default; a type with ttl 0 gets none.
  private readonly __caches: ReadonlyMap<PactCacheType, AbstractEngine>;
  // Per-type TTLs in SECONDS (validated minutes × 60).
  private readonly __cacheTtl: ReadonlyMap<PactCacheType, number>;

  // Typed front door: generics are inferred from the argument (callers never
  // write type args) and flow into the class's own B/M params — modules are
  // the keys of modulePermissions. A hand-written definition gets
  // literal-level checking of permission names here; dynamic data (config
  // files, DB) is covered by the constructor's mask resolution, which throws
  // on any unknown permission name.
  static create<
    const PB extends PermissionBits,
    const MP extends ModulePermissions<PB>,
  >(definition: {
    bits: PB;
    modulePermissions: MP;
    activeStatuses?: readonly string[];
    hooks?: PactHooks<keyof MP & string>;
    options?: EventOptionKeys<PactOptions, PactEvents>;
  }): Pact<PB, keyof MP & string> {
    return new Pact<PB, keyof MP & string>(
      definition.bits,
      definition.modulePermissions,
      definition.activeStatuses ?? ['ACTIVE'],
      definition.hooks ?? {},
      definition.options ?? {},
    );
  }

  protected constructor(
    bits: B,
    modulePermissions: ModulePermissions<B>,
    activeStatuses: readonly string[],
    hooks: PactHooks<M>,
    options: EventOptionKeys<PactOptions, PactEvents>,
  ) {
    super();
    if (
      !Array.isArray(activeStatuses) || activeStatuses.length === 0 ||
      activeStatuses.some((s) => typeof s !== 'string' || s.trim() === '')
    ) {
      throw new PactError('INVALID_STATUSES');
    }
    this.activeStatuses = Object.freeze([...activeStatuses]);
    this.__activeStatusSet = new Set(activeStatuses);
    this._hooks = Object.freeze({ ...hooks });
    // Caching is always initialized: no user config means MEMORY with
    // the default per-type TTLs below. The Options base merges groups
    // ONE level deep, so a user-supplied `cache.ttl` record replaces the
    // default wholesale (zeroed types are the explicit opt-out) while
    // `cache.engine`/`cache.options` compose with it.
    super._setOptions(options, {
      secretPrefix: 'pact',
      cache: { ttl: { principal: 15, apiKey: 5, session: 5 } },
      session: { ttl: 480 },
      reset: { ttl: 15 },
    });
    this.bits = Object.freeze({ ...bits });
    this.__validateBits();
    this.modules = Object.freeze(
      Object.keys(modulePermissions),
    ) as readonly M[];
    this.moduleMasks = Object.freeze(
      this.__resolveModuleMasks(modulePermissions),
    );
    // Cacher returns the existing instance for a name it already built, so
    // same-name Pacts share per-type caches (and the second one's engine
    // options are ignored) — that's the deliberate production default.
    const cache = this._getOption('cache');
    const engine = (cache?.engine ?? 'MEMORY').trim().toUpperCase();
    const ttl = new Map<PactCacheType, number>();
    for (
      const [type, minutes] of Object.entries(cache?.ttl ?? {}) as [
        PactCacheType,
        number,
      ][]
    ) {
      if (minutes > 0) ttl.set(type, minutes * 60);
    }
    const caches = new Map<PactCacheType, AbstractEngine>();
    try {
      for (const type of ttl.keys()) {
        caches.set(
          type,
          Cacher.create(engine, `${this._cacheName()}${NS_SEP}${type}`, {
            ...cache?.options,
          }),
        );
      }
    } catch (error) {
      throw new PactError('CACHE_INIT_FAILED', { engine }, error as Error);
    }
    this.__cacheTtl = ttl;
    this.__caches = caches;
    const oauth = new Map<string, OAuthClient>();
    for (
      const [name, cfg] of Object.entries(this._getOption('oauth') ?? {})
    ) {
      oauth.set(name, new OAuthClient(name, cfg));
    }
    this.__oauth = oauth;
  }

  public getModulePermissions(module: M): readonly (keyof B)[] {
    const mask = this.getModulePermissionMask(module);
    return Object.entries(this.bits)
      .filter(([_, bit]) => (mask & bit) !== 0n)
      .map(([permission]) => permission as keyof B);
  }

  public getModulePermissionMask(module: M): bigint {
    const mask = this.moduleMasks[module];
    if (mask === undefined) {
      throw new PactError('UNKNOWN_MODULE', { module });
    }
    return mask;
  }

  /**
   * Does the principal behind `principalId` hold `permission` in
   * `module`? Resolution goes principal-cache → `getPrincipal` hook; an
   * unresolvable id (or a module absent from the resolved grants)
   * evaluates as an empty mask — fail-closed.
   *
   * @throws {PactError} `MISSING_HOOK` when no `getPrincipal` hook is
   *   configured; `UNKNOWN_MODULE` / `UNKNOWN_PERMISSION` /
   *   `PERMISSION_NOT_IN_MODULE` on definition misuse — only the grants
   *   evaluation itself is a boolean.
   */
  public async hasPermission(
    principalId: string,
    module: M,
    permission: keyof B,
  ): Promise<boolean> {
    const principal = await this._resolvePrincipal(principalId);
    return this.__evaluate(
      module,
      permission,
      principal?.grants[module] ?? 0n,
    );
  }

  /**
   * Like {@link hasPermission}, but throws when the permission is not
   * granted (including when `principalId` does not resolve).
   *
   * @throws {PactError} `PERMISSION_DENIED` when the principal lacks the
   *   permission; `MISSING_HOOK` and definition-misuse codes as in
   *   {@link hasPermission}.
   */
  public async assert(
    principalId: string,
    module: M,
    permission: keyof B,
  ): Promise<void> {
    const principal = await this._resolvePrincipal(principalId);
    if (
      !this.__evaluate(module, permission, principal?.grants[module] ?? 0n)
    ) {
      throw new PactError('PERMISSION_DENIED', {
        kind: principal?.kind ?? 'PRINCIPAL',
        principal: principalId,
        permission: String(permission),
        module,
      });
    }
  }

  /**
   * Register sugar over the app's storage: existence check
   * (`getUser({ by: 'IDENTIFIER' })`), pbkdf2 hash, `createUser` hook.
   * Deeper validation (identifier format, password policy) belongs at
   * the application boundary, and identifier races are ultimately
   * settled by the storage layer's unique constraint. The default
   * status is the first entry of `activeStatuses`; pass e.g. a
   * pending-verification status to register a user who cannot yet
   * authenticate.
   *
   * @throws {PactError} `MISSING_HOOK` without `getUser` + `createUser`;
   *   `USER_EXISTS` on a duplicate identifier.
   */
  public async register(input: {
    identifier: string;
    password: string;
    grants?: Readonly<Partial<Record<M, bigint>>>;
    status?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }): Promise<PactStoredUser> {
    const { getUser, createUser } = this._hooks;
    if (getUser === undefined || createUser === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'getUser and createUser' });
    }
    const existing = await getUser({
      by: 'IDENTIFIER',
      identifier: input.identifier,
    });
    if (existing !== null) {
      throw new PactError('USER_EXISTS', { identifier: input.identifier });
    }
    return await createUser({
      identifier: input.identifier,
      status: input.status ?? this.activeStatuses[0]!,
      passwordHash: await pbkdf2Hash(input.password),
      grants: serializeGrants(input.grants ?? {}),
      metadata: input.metadata,
    });
  }

  /**
   * Issue an API key: generate the pair, hand the RAW secret to the
   * `saveApiKey` hook (encrypt it at rest, app-side — never hash, the
   * same secret serves presentation and HMAC), and return the pair.
   * This is the only time the secret is available — show it once.
   *
   * @throws {PactError} `MISSING_HOOK` without `saveApiKey`.
   */
  public async issueApiKey(input: {
    userId?: string;
    grants?: Readonly<Partial<Record<M, bigint>>>;
    status?: string;
    metadata?: Readonly<Record<string, unknown>>;
  } = {}): Promise<{ key: string; secret: string }> {
    const save = this._hooks.saveApiKey;
    if (save === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'saveApiKey' });
    }
    const pair = this.generateAPIKeyPair();
    await save({
      id: pair.key,
      userId: input.userId,
      status: input.status ?? this.activeStatuses[0]!,
      secret: pair.secret,
      grants: serializeGrants(input.grants ?? {}),
      metadata: input.metadata,
    });
    return pair;
  }

  /**
   * Revoke an API key via the `revokeApiKey` hook, then evict its cache
   * entry so the revocation takes effect immediately rather than after
   * the TTL.
   *
   * @throws {PactError} `MISSING_HOOK` without `revokeApiKey`.
   */
  public async revokeApiKey(keyId: string): Promise<void> {
    const revoke = this._hooks.revokeApiKey;
    if (revoke === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'revokeApiKey' });
    }
    await revoke(keyId);
    await this._cacheInvalidate('apiKey', keyId);
  }

  /**
   * Plain identifier + password login: mints an opaque session (token
   * shown once — only its sha-256 is stored) for the resolved
   * principal.
   *
   * Failure semantics: unknown identifier, password-less user, and
   * wrong password all throw the SAME variable-free
   * `INVALID_CREDENTIALS` (account existence never leaks) with
   * comparable pbkdf2 work burned on each path; `NOT_ACTIVE` — carrying
   * the actual status so the app can route (verify-your-email vs
   * suspended) — is only reachable AFTER the password verified, so it
   * is not an enumeration oracle. What to disclose to the END user is
   * the application's call.
   *
   * @throws {PactError} `INVALID_CREDENTIALS` / `NOT_ACTIVE` as above;
   *   `INVALID_GRANTS` when the stored grants are corrupt;
   *   `MISSING_HOOK` without `getUser`, or when no session store exists
   *   (neither a `saveSession` hook nor a session cache TTL).
   */
  public async login(credentials: {
    identifier: string;
    password: string;
  }): Promise<PactLoginResult<M>> {
    const getUser = this._hooks.getUser;
    if (getUser === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'getUser' });
    }
    const user = await getUser({
      by: 'IDENTIFIER',
      identifier: credentials.identifier,
    });
    const hash = user?.passwordHash ?? await this.__getDummyHash();
    const verified = await pbkdf2Verify(credentials.password, hash);
    if (user === null || user.passwordHash === undefined || !verified) {
      throw new PactError('INVALID_CREDENTIALS');
    }
    if (!this.__activeStatusSet.has(user.status)) {
      throw new PactError('NOT_ACTIVE', {
        status: user.status,
        userId: user.id,
      });
    }
    const principal = this.__toPrincipal(user);
    if (principal === null) {
      throw new PactError('INVALID_GRANTS', {
        reason: `stored grants for user '${user.id}' are malformed`,
      });
    }
    await this._cacheSet('principal', principal.id, principal);
    const session = await this.__mintSession(user.id);
    return { principal, session };
  }

  /**
   * Build the authorization redirect for a configured OAuth instance.
   * The application must stow the returned `state`/`codeVerifier`/
   * `nonce` (cookie or server-side session) and hand them back to
   * {@link oauthLogin} as `expected` — pact holds no state between the
   * two calls.
   *
   * @throws {PactError} `UNKNOWN_PROVIDER` for an unconfigured instance;
   *   `OAUTH_EXCHANGE_FAILED` when OIDC discovery fails.
   */
  public async oauthRedirect(provider: string): Promise<PactOAuthRedirect> {
    const { url, state, verifier, nonce } = await this.__oauthClient(provider)
      .authorizationUrl();
    return { url, state, codeVerifier: verifier, nonce };
  }

  /**
   * Complete an OAuth login: verify the callback (state, PKCE, id_token
   * per policy), resolve the identity to a local user via
   * `getUser({ by: 'OAUTH' })` — auto-provisioning through `createUser`
   * on first login when the instance enables it — and mint the same
   * opaque session as {@link login}. The verified `profile` is returned
   * on EVERY login so the application can sync changed claims.
   *
   * @throws {PactError} `UNKNOWN_PROVIDER` / `OAUTH_STATE_MISMATCH` /
   *   `OAUTH_EXCHANGE_FAILED` / `OAUTH_PROFILE_FAILED` /
   *   `OAUTH_IDTOKEN_INVALID` / `OAUTH_JWKS_UNAVAILABLE` from the flow;
   *   `OAUTH_UNLINKED` when no user is linked and autoProvision is off;
   *   `NOT_ACTIVE` / `INVALID_GRANTS` as in {@link login};
   *   `MISSING_HOOK` without `getUser` (or `createUser` when
   *   provisioning fires), or without any session store.
   */
  public async oauthLogin(
    provider: string,
    params: { code: string; state?: string },
    expected: { state: string; codeVerifier: string; nonce?: string },
  ): Promise<PactLoginResult<M> & { profile: PactOAuthProfile }> {
    const getUser = this._hooks.getUser;
    if (getUser === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'getUser' });
    }
    const client = this.__oauthClient(provider);
    const profile = await client.callback({
      code: params.code,
      state: params.state,
      expectedState: expected.state,
      verifier: expected.codeVerifier,
      expectedNonce: expected.nonce,
    });
    let user = await getUser({ by: 'OAUTH', provider, subject: profile.id });
    if (user === null) {
      if (!client.autoProvision) {
        throw new PactError('OAUTH_UNLINKED', {
          provider,
          subject: profile.id,
        });
      }
      const createUser = this._hooks.createUser;
      if (createUser === undefined) {
        throw new PactError('MISSING_HOOK', { hook: 'createUser' });
      }
      user = await createUser({
        identifier: profile.email ?? `${provider}:${profile.id}`,
        status: this.activeStatuses[0]!,
        grants: serializeGrants({}),
        oauth: { provider, subject: profile.id, profile },
      });
    }
    if (!this.__activeStatusSet.has(user.status)) {
      throw new PactError('NOT_ACTIVE', {
        status: user.status,
        userId: user.id,
      });
    }
    const principal = this.__toPrincipal(user);
    if (principal === null) {
      throw new PactError('INVALID_GRANTS', {
        reason: `stored grants for user '${user.id}' are malformed`,
      });
    }
    await this._cacheSet('principal', principal.id, principal);
    const session = await this.__mintSession(user.id);
    return { principal, session, profile };
  }

  /**
   * End one session: delete it from the app store (when the hook
   * exists) and evict it from the session cache. Idempotent — an
   * unknown or already-ended token is a no-op.
   */
  public async logout(token: string): Promise<void> {
    const id = await sha256(token);
    const deleteSession = this._hooks.deleteSession;
    if (deleteSession !== undefined) await deleteSession(id);
    await this._cacheInvalidate('session', id);
  }

  /**
   * End every session of a user. Requires the `deleteSessions` hook —
   * the cache alone cannot enumerate per-user — and clears the whole
   * session cache afterwards so no evicted session survives as a
   * cached copy.
   *
   * @throws {PactError} `MISSING_HOOK` without `deleteSessions`.
   */
  public async logoutAll(userId: string): Promise<void> {
    const deleteSessions = this._hooks.deleteSessions;
    if (deleteSessions === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'deleteSessions' });
    }
    await deleteSessions(userId);
    await this._cacheClear('session');
  }

  /**
   * Set a user's password (hashing included), evict their cached
   * principal, and — when `deleteSessions` is configured — end their
   * sessions so the old credential stops working everywhere.
   *
   * @throws {PactError} `MISSING_HOOK` without `setPassword`.
   */
  public async setPassword(
    userId: string,
    newPassword: string,
  ): Promise<void> {
    const hook = this._hooks.setPassword;
    if (hook === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'setPassword' });
    }
    await hook(userId, await pbkdf2Hash(newPassword));
    await this.invalidatePrincipal(userId);
    const deleteSessions = this._hooks.deleteSessions;
    if (deleteSessions !== undefined) {
      await deleteSessions(userId);
      await this._cacheClear('session');
    }
  }

  /**
   * Begin a password reset: mint a single-use token (stored by sha-256,
   * shown once) for the application to deliver out-of-band. Returns
   * `null` for an unknown identifier — what to reveal to the END user
   * is the application's call.
   *
   * @throws {PactError} `MISSING_HOOK` without `getUser` +
   *   `saveResetToken`.
   */
  public async requestPasswordReset(
    identifier: string,
  ): Promise<{ token: string; expiresAt: Date } | null> {
    const { getUser, saveResetToken } = this._hooks;
    if (getUser === undefined || saveResetToken === undefined) {
      throw new PactError('MISSING_HOOK', {
        hook: 'getUser and saveResetToken',
      });
    }
    const user = await getUser({ by: 'IDENTIFIER', identifier });
    if (user === null) return null;
    const ttl = this._getOption('reset')?.ttl ?? 15;
    const expiresAt = new Date(Date.now() + ttl * 60_000);
    const token = this.generatePasswordResetToken();
    await saveResetToken({ id: await sha256(token), userId: user.id, expiresAt });
    return { token, expiresAt };
  }

  /**
   * Complete a password reset: consume the token (single-use — the hook
   * returns AND deletes), check its window, then delegate to
   * {@link setPassword} (which also evicts the principal and ends
   * sessions when possible). `false` on an invalid, expired, or
   * already-used token.
   *
   * @throws {PactError} `MISSING_HOOK` without `consumeResetToken` +
   *   `setPassword`.
   */
  public async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<boolean> {
    const { consumeResetToken, setPassword } = this._hooks;
    if (consumeResetToken === undefined || setPassword === undefined) {
      throw new PactError('MISSING_HOOK', {
        hook: 'consumeResetToken and setPassword',
      });
    }
    const record = await consumeResetToken(await sha256(token));
    if (record === null || record.expiresAt.getTime() <= Date.now()) {
      return false;
    }
    await this.setPassword(record.userId, newPassword);
    return true;
  }

  public generateAPIKeyPair(): { key: string; secret: string } {
    return {
      key: this._generateSecret('ak', 16),
      secret: this._generateSecret('as', 32),
    };
  }

  public generatePasswordResetToken(): string {
    return this._generateSecret('pr', 32);
  }

  public generateSessionToken(): string {
    return this._generateSecret('st', 32);
  }

  public generateRefreshToken(): string {
    return this._generateSecret('rt', 32);
  }

  // TOTP seeds are unprefixed canonical base32 (20 bytes = 160 bits, the
  // RFC 4226 recommendation): authenticator apps and otpauth:// URLs expect
  // base32, and a prefix would corrupt the seed. 20 bytes = 32 base32 chars
  // (whole 40-bit groups), so the URL secret round-trips byte-identical.
  public generateMFASecret(): string {
    return generateBase32Secret(20);
  }

  public generateMFAAuthURL(
    secret: string,
    accountName: string,
    issuer: string,
  ): string {
    return generateOTPAuthURL({ type: 'totp', secret, accountName, issuer });
  }

  /**
   * Evict one principal from the cache. Grants live in app storage where
   * pact cannot see writes, so call this after changing an actor's
   * grants/status to make the change take effect immediately instead of
   * after the TTL. No-op when principal caching is disabled.
   */
  public invalidatePrincipal(id: string): Promise<void> {
    return this._cacheInvalidate('principal', id);
  }

  /**
   * Clear every cached entry across all cache types — the coarse public
   * escape hatch (e.g. after a bulk grants migration or a security
   * incident). Per-type/per-key invalidation stays protected on the
   * hook paths. Best-effort: a backend failure on one type neither
   * throws nor blocks the others.
   */
  public async clearCache(): Promise<void> {
    await Promise.all(
      [...this.__caches.keys()].map((type) => this._cacheClear(type)),
    );
  }

  // Both options are optional — only well-formedness is rejected here; deep
  // cache validation belongs to Cacher when the engine is created.
  protected override _processOption<K extends keyof PactOptions>(
    key: K,
    value: PactOptions[K],
  ): PactOptions[K] {
    if (value !== undefined) {
      switch (key) {
        case 'secretPrefix':
          if (typeof value !== 'string' || !/^[a-z0-9]{1,4}$/i.test(value)) {
            throw new PactError('INVALID_OPTION', {
              option: 'secretPrefix',
              reason: 'must be 1-4 alphanumeric characters',
            });
          }
          break;
        case 'cache':
          this.__validateCacheOption(value as PactCacheConfig);
          break;
        case 'session':
        case 'reset':
          this.__validateTtlGroup(key, value as { ttl?: number });
          break;
        case 'oauth':
          // Shallow shape only — per-instance validation happens in the
          // OAuthClient constructor, eagerly, at Pact construction.
          if (
            value === null || typeof value !== 'object' || Array.isArray(value)
          ) {
            throw new PactError('INVALID_OPTION', {
              option: 'oauth',
              reason: 'must be a record of instance name to provider config',
            });
          }
          break;
      }
    }
    return value;
  }

  // The cacher instance name is the key namespace and a process-wide
  // contract, so it is a protected seam rather than an option: userland
  // cannot repoint pact into another component's cache namespace, while
  // test subclasses can override for isolation.
  protected _cacheName(): string {
    return 'pact';
  }

  /**
   * Resolve a principal by actor id: principal cache first, then the
   * `getPrincipal` hook — or, when only `getUser` is configured, a
   * `getUser({ by: 'ID' })` fetch resolved through the whitelist
   * (`getPrincipal` takes precedence when both exist). Non-null results
   * are cached when the `principal` type has a TTL. `null` means the
   * actor does not exist or must not authorize — callers treat it as no
   * access (fail-closed).
   *
   * @throws {PactError} `MISSING_HOOK` when neither hook is configured
   *   (checked before the cache, so misconfiguration is loud even on a
   *   warm cache).
   */
  protected async _resolvePrincipal(
    id: string,
  ): Promise<PactPrincipal<M> | null> {
    const { getPrincipal, getUser } = this._hooks;
    if (getPrincipal === undefined && getUser === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'getPrincipal or getUser' });
    }
    const cached = await this._cacheGet<PactPrincipal<M>>('principal', id);
    if (cached !== undefined) return cached;
    const principal = getPrincipal !== undefined
      ? await getPrincipal(id)
      : this.__toPrincipal(await getUser!({ by: 'ID', id }));
    if (principal === null) return null;
    await this._cacheSet('principal', id, principal);
    return principal;
  }

  /**
   * Read a cached value; a backend failure degrades to a miss so the
   * caller falls back to the source — auth must not fail because the
   * cache is down.
   */
  protected async _cacheGet<T>(
    type: PactCacheType,
    key: string,
  ): Promise<T | undefined> {
    const engine = this.__caches.get(type);
    if (engine === undefined) return undefined;
    try {
      const raw = await engine.get<unknown>(key);
      return raw === undefined ? undefined : decodeFromCache(raw) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * Store a value under the type's fixed TTL (never windowed — staleness
   * must stay bounded so a revocation cannot be masked by a hot entry
   * resetting its own expiry). No-op when the type has no TTL; a backend
   * failure is swallowed (the source read already succeeded — it just
   * was not cached).
   */
  protected async _cacheSet(
    type: PactCacheType,
    key: string,
    value: unknown,
  ): Promise<void> {
    const engine = this.__caches.get(type);
    const expiry = this.__cacheTtl.get(type);
    if (engine === undefined || expiry === undefined) return;
    try {
      await engine.set(key, encodeForCache(value), { expiry });
    } catch {
      // Degrade: a failed cache write must not fail the operation.
    }
  }

  /**
   * Drop one cached entry — call from every mutating path that stales it
   * (e.g. a password/status change invalidates the cached principal).
   */
  protected async _cacheInvalidate(
    type: PactCacheType,
    key: string,
  ): Promise<void> {
    const engine = this.__caches.get(type);
    if (engine === undefined) return;
    try {
      await engine.delete(key);
    } catch {
      // Best-effort: an unreachable backend expires the entry by TTL.
    }
  }

  /** Clear a whole type's namespace (e.g. sessions on a global logout). */
  protected async _cacheClear(type: PactCacheType): Promise<void> {
    const engine = this.__caches.get(type);
    if (engine === undefined) return;
    try {
      await engine.clear();
    } catch {
      // Best-effort: entries expire by TTL.
    }
  }

  protected _generateSecret(tag: string, byteLength: number): string {
    const prefix = this._getOption('secretPrefix') ?? 'pact';
    return `${prefix}_${tag}_${generateHexSecret(byteLength)}`;
  }

  // Resolution WHITELIST: only id/kind/grants/metadata survive — the
  // stored record's credentials and extra fields never reach a principal
  // (which is cached, logged, and handed to app code). A status outside
  // activeStatuses and corrupt stored grants both deny (null) rather
  // than throw: storage state must not 500 the request path.
  private __toPrincipal(
    user: PactStoredUser | null,
  ): PactPrincipal<M> | null {
    if (user === null || !this.__activeStatusSet.has(user.status)) {
      return null;
    }
    try {
      // Unknown module keys in stored grants are harmless — evaluation
      // only ever reads declared modules.
      const grants = deserializeGrants(user.grants) as Readonly<
        Partial<Record<M, bigint>>
      >;
      return { kind: 'USER', id: user.id, grants, metadata: user.metadata };
    } catch {
      return null;
    }
  }

  /** The configured OAuth client for `provider`, or a typed throw. */
  private __oauthClient(provider: string): OAuthClient {
    const client = this.__oauth.get(provider);
    if (client === undefined) {
      throw new PactError('UNKNOWN_PROVIDER', { provider });
    }
    return client;
  }

  // Mint + store one opaque session under the configured lifetime —
  // shared by password and OAuth logins so the session contract cannot
  // drift between entry points.
  private async __mintSession(
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const ttl = this._getOption('session')?.ttl ?? 480;
    const expiresAt = new Date(Date.now() + ttl * 60_000);
    const token = this.generateSessionToken();
    await this.__storeSession({
      id: await sha256(token),
      userId,
      expiresAt,
    });
    return { token, expiresAt };
  }

  // Lazily-built once so every login failure path burns real pbkdf2
  // work — unknown identifiers and password-less users must cost the
  // same as a wrong password.
  private __dummyHash?: string;

  private async __getDummyHash(): Promise<string> {
    this.__dummyHash ??= await pbkdf2Hash(generateHexSecret(16));
    return this.__dummyHash;
  }

  // Store a minted session. With a saveSession hook the app store is
  // authoritative and the cache is a read-cache (type TTL). Without it
  // the session engine IS the store: write with the session's remaining
  // LIFETIME (not the read-cache TTL) and do NOT swallow failures — a
  // session that cannot be stored must not be handed out.
  private async __storeSession(session: PactStoredSession): Promise<void> {
    const save = this._hooks.saveSession;
    if (save !== undefined) {
      await save(session);
      await this._cacheSet('session', session.id, session);
      return;
    }
    const engine = this.__caches.get('session');
    if (engine === undefined) {
      throw new PactError('MISSING_HOOK', {
        hook: 'saveSession (or a session cache TTL > 0)',
      });
    }
    const seconds = Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000);
    await engine.set(session.id, encodeForCache(session), { expiry: seconds });
  }

  // The sync mask-level evaluation both public checks share. Throws only
  // on definition misuse (unknown module/permission, permission outside
  // the module's ceiling) — `grants` is the sole request-time input, so
  // a throw here is a programming error, never a denial.
  private __evaluate(
    module: M,
    permission: keyof B,
    grants: bigint,
  ): boolean {
    const moduleMask = this.moduleMasks[module];
    if (moduleMask === undefined) {
      throw new PactError('UNKNOWN_MODULE', { module });
    }
    // B[keyof B] loses its bigint-ness once narrowed (B[keyof B] & {}), which
    // breaks the & operator below — pin the lookup type instead.
    const permissionBit = this.bits[permission] as bigint | undefined;
    if (permissionBit === undefined) {
      throw new PactError('UNKNOWN_PERMISSION', {
        permission: String(permission),
      });
    }
    if ((moduleMask & permissionBit) === 0n) {
      throw new PactError('PERMISSION_NOT_IN_MODULE', {
        permission: String(permission),
        module,
      });
    }
    return (grants & permissionBit) !== 0n;
  }

  // Shared shape check for the { ttl?: minutes } option groups.
  private __validateTtlGroup(option: string, value: { ttl?: number }): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new PactError('INVALID_OPTION', {
        option,
        reason: 'must be an object',
      });
    }
    const ttl = value.ttl;
    if (
      ttl !== undefined &&
      (typeof ttl !== 'number' || !Number.isInteger(ttl) || ttl < 1 ||
        ttl > MAX_TTL_MINUTES)
    ) {
      throw new PactError('INVALID_OPTION', {
        option: `${option}.ttl`,
        reason: 'must be an integer number of minutes between 1 and ' +
          `${MAX_TTL_MINUTES} (30 days)`,
      });
    }
  }

  // Well-formedness only (split from _processOption for readability);
  // engine existence and engine-option validity stay with Cacher, whose
  // rejection the constructor wraps as CACHE_INIT_FAILED.
  private __validateCacheOption(cfg: PactCacheConfig): void {
    if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
      throw new PactError('INVALID_OPTION', {
        option: 'cache',
        reason: 'must be a PactCacheConfig object',
      });
    }
    if (
      cfg.engine !== undefined &&
      (typeof cfg.engine !== 'string' || cfg.engine.trim() === '')
    ) {
      throw new PactError('INVALID_OPTION', {
        option: 'cache.engine',
        reason: 'must be a non-empty string',
      });
    }
    if (
      cfg.options !== undefined &&
      (cfg.options === null || typeof cfg.options !== 'object' ||
        Array.isArray(cfg.options))
    ) {
      throw new PactError('INVALID_OPTION', {
        option: 'cache.options',
        reason: 'must be a CacherOptions object',
      });
    }
    if (
      cfg.ttl !== undefined &&
      (cfg.ttl === null || typeof cfg.ttl !== 'object' ||
        Array.isArray(cfg.ttl))
    ) {
      throw new PactError('INVALID_OPTION', {
        option: 'cache.ttl',
        reason: 'must be a record of cache type to minutes',
      });
    }
    for (const [type, minutes] of Object.entries(cfg.ttl ?? {})) {
      if (!PACT_CACHE_TYPES.has(type)) {
        throw new PactError('INVALID_OPTION', {
          option: 'cache.ttl',
          reason: `unknown cache type '${type}'`,
        });
      }
      if (
        typeof minutes !== 'number' || !Number.isInteger(minutes) ||
        minutes < 0 || minutes > MAX_TTL_MINUTES
      ) {
        throw new PactError('INVALID_OPTION', {
          option: `cache.ttl.${type}`,
          reason: 'must be an integer number of minutes between 0 and ' +
            `${MAX_TTL_MINUTES} (30 days)`,
        });
      }
    }
  }

  // Bits are atomic capabilities: each must be a distinct single positive
  // bit. Combinations live in grants (a grant is a mask), never in the
  // definition — the single-bit invariant is what keeps every `& bit`
  // check exact (any-of vs all-of cannot diverge on one bit). A zero bit
  // can never be granted; a shared bit makes two permissions
  // indistinguishable (grant one = grant both).
  private __validateBits(): void {
    const seen = new Map<bigint, string>();
    for (const [name, bit] of Object.entries(this.bits)) {
      if (bit <= 0n) {
        throw new PactError('INVALID_BIT', { permission: name, bit });
      }
      if ((bit & (bit - 1n)) !== 0n) {
        throw new PactError('COMPOSITE_BIT', { permission: name, bit });
      }
      const dup = seen.get(bit);
      if (dup !== undefined) {
        throw new PactError('DUPLICATE_BIT', {
          existing: dup,
          permission: name,
          bit,
        });
      }
      seen.set(bit, name);
    }
  }

  // Validation IS resolution: an unknown permission name throws while
  // building the masks, so no separate validation pass exists to drift out
  // of sync. Unknown modules cannot exist — the keys ARE the modules.
  private __resolveModuleMasks(
    modulePermissions: ModulePermissions<B>,
  ): Partial<Record<M, bigint>> {
    const masks: Partial<Record<M, bigint>> = {};
    for (const [module, permissions] of Object.entries(modulePermissions)) {
      let mask = 0n;
      for (const permission of permissions) {
        const bit = this.bits[permission];
        if (bit === undefined) {
          throw new PactError('UNKNOWN_PERMISSION', {
            permission: String(permission),
            module,
          });
        }
        mask |= bit;
      }
      masks[module as M] = mask;
    }
    return masks;
  }
}

const a = Pact.create({
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
  modulePermissions: {
    Post: ['READ', 'EDIT', 'DELETE'],
    Billing: ['READ'],
    Users: ['READ'],
  },
});

a.getModulePermissions('Post');

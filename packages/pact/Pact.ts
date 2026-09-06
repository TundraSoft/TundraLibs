import { pbkdf2Hash, pbkdf2Verify, sha256 } from '@tundralibs/crypt/digest';
import {
  generateBase32Secret,
  generateHexSecret,
  hkdf,
} from '@tundralibs/crypt/generators';
import {
  constantTimeEqual,
  generateOTPAuthURL,
  verifyTOTP,
} from '@tundralibs/crypt/OTP';
import { issueJWT, JWTError, verifyJWT } from '@tundralibs/crypt/JWT';
import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';
import { type EventOptionKeys, Options } from '@tundralibs/utils';
import { AbstractEngine, Cacher } from '@tundralibs/cacher';
import { decodeBase64Url, encodeBase64Url } from '@std/encoding';
import type {
  ModulePermissions,
  PactAuthContext,
  PactBoundPrincipal,
  PactCacheConfig,
  PactCacheType,
  PactCredential,
  PactEvents,
  PactHooks,
  PactLoginResult,
  PactOAuthProfile,
  PactOAuthRedirect,
  PactOptions,
  PactPasskeyAssertionResponse,
  PactPasskeyCreationOptions,
  PactPasskeyRegistrationResponse,
  PactPasskeyRequestOptions,
  PactPrincipal,
  PactStoredApiKey,
  PactStoredPasskey,
  PactStoredSession,
  PactStoredUser,
  PactVerifiedCredentials,
  PermissionBits,
} from './types/mod.ts';
import { PACT_AUTH_FAILURE_CODES, PactError } from './errors/mod.ts';
import { BoundPrincipal } from './BoundPrincipal.ts';
import { deserializeGrants, serializeGrants } from './grants.ts';
import { OAuthClient } from './oauth/mod.ts';
import {
  COSE_BY_ALGORITHM,
  type NormalizedPasskeyConfig,
  normalizePasskeyConfig,
  verifyAssertionCeremony,
  verifyRegistrationCeremony,
} from './passkeys/mod.ts';
import {
  decodeFromCache,
  encodeForCache,
  MAX_TTL_MINUTES,
  NS_SEP,
  PACT_CACHE_TYPES,
} from './cache.ts';

/** Auto-name counter for unnamed instances (`pact-<n>`). */
let instanceSeq = 0;

/**
 * The auth engine: bitmask authorization, login and sessions (opaque or
 * JWT with refresh rotation), four credential schemes, TOTP MFA, OAuth
 * sign-in, and content signing — all over the app's own storage via
 * {@link PactHooks}. Construct through {@link Pact.create}; transport
 * (headers, cookies, routes) stays with the framework, storage with the
 * application, cryptography with `@tundralibs/crypt`.
 *
 * @example
 * ```typescript
 * const pact = Pact.create({
 *   bits: { READ: 1n, EDIT: 2n },
 *   modulePermissions: { Post: ['READ', 'EDIT'] },
 *   hooks: { getPrincipal: (id) => lookupPrincipal(id) },
 * });
 * await pact.assert('user-1', 'Post', 'EDIT'); // throws PERMISSION_DENIED
 * ```
 */
export class Pact<B extends PermissionBits, M extends string>
  extends Options<PactOptions, PactEvents<M>> {
  /**
   * The instance name — the cacher NAMESPACE root (`<name>__principal`,
   * …), mirroring norm's instance naming. Same name = shared cache
   * across processes on a shared engine; different definitions MUST use
   * different names. Auto-generated (`pact-<n>`) when omitted; an
   * explicit name is REQUIRED to cache on a non-MEMORY engine.
   */
  public readonly name: string;

  /** The permission catalog: name → atomic bit, validated distinct
   * single positive bits at construction. */
  public readonly bits: Readonly<B>;
  /**
   * Derived from modulePermissions keys — a module exists iff it declares
   * its permission ceiling.
   */
  public readonly modules: readonly M[];
  /**
   * Resolved at construction: module -> OR-ed mask of its allowed bits.
   * Partial only for wide M (dynamic definitions); with a literal definition
   * every module has a mask by construction.
   */
  public readonly moduleMasks: Readonly<Partial<Record<M, bigint>>>;

  /**
   * App-defined lifecycle statuses permitted to authenticate/authorize;
   * any status outside this list is fail-closed at resolution.
   */
  public readonly activeStatuses: readonly string[];
  private readonly __activeStatusSet: ReadonlySet<string>;

  /**
   * Bring-your-own-storage seams — see PactHooks.
   */
  protected readonly _hooks: Readonly<PactHooks<M>>;

  // One client per configured oauth instance, built eagerly so config
  // errors surface at construction rather than first login.
  private readonly __oauth: ReadonlyMap<string, OAuthClient>;

  // Per-type cacher instances, created eagerly (so config errors surface
  // at construction) for exactly the types the user gave a positive TTL
  // — caching is opt-in, so no config means no instances at all.
  private readonly __caches: ReadonlyMap<PactCacheType, AbstractEngine>;

  /** How long a bound principal's grants stay authoritative (ms). */
  private readonly __principalFreshnessMs: number;

  /** Bumped by the revocation APIs; every outstanding bound principal
   * born under an older epoch re-resolves at its next check. */
  private __revocationEpoch = 0;

  /** Validated passkey configuration; undefined = feature off. */
  private readonly __passkeys?: NormalizedPasskeyConfig;
  // Per-type TTLs in SECONDS (validated minutes × 60).
  private readonly __cacheTtl: ReadonlyMap<PactCacheType, number>;

  /**
   * Typed front door: generics are inferred from the argument (callers never
   * write type args) and flow into the class's own B/M params — modules are
   * the keys of modulePermissions. A hand-written definition gets
   * literal-level checking of permission names here; dynamic data (config
   * files, DB) is covered by the constructor's mask resolution, which throws
   * on any unknown permission name.
   */
  static create<
    const PB extends PermissionBits,
    const MP extends ModulePermissions<PB>,
  >(definition: {
    bits: PB;
    modulePermissions: MP;
    name?: string;
    activeStatuses?: readonly string[];
    hooks?: PactHooks<keyof MP & string>;
    options?: EventOptionKeys<PactOptions, PactEvents<keyof MP & string>>;
  }): Pact<PB, keyof MP & string> {
    // `new this`, not `new Pact`: a subclass calling create() gets an
    // instance of itself (overrides live, instanceof holds). Subclasses
    // that narrow the constructor signature must shadow create() too —
    // JS silently discards the definition against undeclared params.
    return new this<PB, keyof MP & string>(
      definition.bits,
      definition.modulePermissions,
      definition.activeStatuses ?? ['ACTIVE'],
      definition.hooks ?? {},
      definition.options ?? {},
      definition.name,
    );
  }

  /**
   * Protected — {@link Pact.create} is the typed front door (it derives
   * `M` from the modulePermissions keys). Subclasses keeping this
   * signature inherit a working `create()`; a narrowed constructor must
   * shadow `create()` too.
   */
  protected constructor(
    bits: B,
    modulePermissions: ModulePermissions<B>,
    activeStatuses: readonly string[],
    hooks: PactHooks<M>,
    options: EventOptionKeys<PactOptions, PactEvents<M>>,
    name?: string,
  ) {
    super();
    if (name !== undefined) {
      // ':' is cacher's namespace separator; '__' is pact's type
      // separator — either would let one namespace become a prefix of
      // another (norm's rule, for the same reason).
      if (
        typeof name !== 'string' || name.length === 0 ||
        name !== name.trim() || name.includes(':') || name.includes(NS_SEP)
      ) {
        throw new PactError('INVALID_OPTION', {
          option: 'name',
          reason: "must be a non-empty trimmed string without ':' or '__'",
        });
      }
      this.name = name;
    } else {
      this.name = `pact-${++instanceSeq}`;
    }
    if (
      !Array.isArray(activeStatuses) || activeStatuses.length === 0 ||
      activeStatuses.some((s) => typeof s !== 'string' || s.trim() === '')
    ) {
      throw new PactError('INVALID_STATUSES');
    }
    this.activeStatuses = Object.freeze([...activeStatuses]);
    this.__activeStatusSet = new Set(activeStatuses);
    this._hooks = Object.freeze({ ...hooks });
    // Caching is OPT-IN: with no `cache` config nothing is cached and
    // every resolution hits the hooks — how (and whether) to cache is
    // the application's decision.
    super._setOptions(options, {
      secretPrefix: 'pact',
      session: {
        ttl: 480,
        strategy: 'OPAQUE',
        refresh: { ttl: 10_080, grace: 30 },
      },
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
    // Cacher returns the existing instance for a name it already built,
    // so Pacts created with the same explicit `name` share per-type
    // caches (the second one's engine options are ignored) — deliberate:
    // the name IS the deployment-wide cache identity. Unnamed instances
    // auto-namespace (`pact-<n>`) and never collide.
    const cache = this._getOption('cache');
    const engine = (cache?.engine ?? 'MEMORY').trim().toUpperCase();
    // Auto names (`pact-<n>`) are per-process counters: on a shared
    // external engine two processes (or two apps) would namespace
    // differently-or-identically by accident — the exact silent-collision
    // failure the name exists to prevent. Norm's rule, for norm's reason.
    if (cache !== undefined && engine !== 'MEMORY' && name === undefined) {
      throw new PactError('INVALID_OPTION', {
        option: 'name',
        reason: `an explicit instance name is required to cache on a ` +
          `shared ('${engine}') engine — the name is the cache namespace`,
      });
    }
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
    // Bound principals stay authoritative for the same window the
    // deployment already accepted for cached principals; uncached
    // deployments declared "always hit the store", so they get a tight
    // default no HTTP request outlives.
    this.__principalFreshnessMs = (ttl.get('principal') ?? 60) * 1000;
    const oauth = new Map<string, OAuthClient>();
    for (
      const [name, cfg] of Object.entries(this._getOption('oauth') ?? {})
    ) {
      oauth.set(
        name,
        new OAuthClient(name, cfg, (reason) => {
          this._emit('idTokenUnverified', name, reason);
        }),
      );
    }
    this.__oauth = oauth;
    // Passkeys: validate config AND hook presence at construction, so
    // a misconfigured deployment fails at boot instead of surfacing
    // MISSING_HOOK mid-request.
    const passkeys = this._getOption('passkeys');
    if (passkeys !== undefined) {
      this.__passkeys = normalizePasskeyConfig(passkeys);
      const required = [
        'getPasskey',
        'getPasskeys',
        'savePasskey',
        'updatePasskeyCounter',
        'getUser',
      ] as const;
      for (const hook of required) {
        if (this._hooks[hook] === undefined) {
          throw new PactError('MISSING_HOOK', {
            hook: `${hook} (required when passkeys are configured)`,
          });
        }
      }
    }
  }

  /**
   * The permission names `module` declares in its ceiling.
   *
   * @throws {PactError} `UNKNOWN_MODULE` for a module not in the definition.
   */
  public getModulePermissions(module: M): readonly (keyof B)[] {
    const mask = this.getModulePermissionMask(module);
    return Object.entries(this.bits)
      .filter(([_, bit]) => (mask & bit) !== 0n)
      .map(([permission]) => permission as keyof B);
  }

  /**
   * The OR-ed mask of every permission `module` declares — its ceiling.
   *
   * @throws {PactError} `UNKNOWN_MODULE` for a module not in the definition.
   */
  public getModulePermissionMask(module: M): bigint {
    const mask = Object.hasOwn(this.moduleMasks, module)
      ? this.moduleMasks[module]
      : undefined;
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
      this.__grantOf(principal?.grants ?? null, module),
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
      !this.__evaluate(
        module,
        permission,
        this.__grantOf(principal?.grants ?? null, module),
      )
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
   * Resolve `id` and mint a bound principal: the plain principal data
   * plus `hasPermission`/`assert` that check against the resolved
   * grants with no further store round-trips while fresh (the freshness
   * budget is `cache.ttl.principal`, or 60s uncached; revocation APIs
   * force re-resolution at the next check). The out-of-request mint
   * point — WebSocket upgrades, background jobs, admin tooling;
   * request handlers get one for free on `authenticate`'s context.
   *
   * Bound principals cannot be forged (hand-built objects have no
   * working methods) and do not survive serialization or structured
   * clone — across a process boundary, pass the id and re-resolve.
   *
   * @throws {PactError} `MISSING_HOOK` as in {@link hasPermission}.
   */
  public async principalOf(
    id: string,
  ): Promise<PactBoundPrincipal<M, B> | null> {
    const principal = await this._resolvePrincipal(id);
    return principal === null ? null : this.__bind(principal);
  }

  /**
   * The ONLY mint seam for bound principals; both entry points
   * (authenticate, principalOf) hand it pact-internal resolutions —
   * userland data never becomes a bound principal. The kernel closes
   * over this instance's evaluation, resolution, and epoch.
   */
  private __bind(principal: PactPrincipal<M>): PactBoundPrincipal<M, B> {
    // One class carries either union arm, so it cannot BE the
    // discriminated union — the mint seam vouches for the shape.
    return new BoundPrincipal<B, M>(principal, {
      evaluate: (module, permission, grants) =>
        this.__evaluate(module, permission, this.__grantOf(grants, module)),
      resolve: (id) => this._resolvePrincipal(id),
      epoch: () => this.__revocationEpoch,
      freshnessMs: this.__principalFreshnessMs,
    }) as unknown as PactBoundPrincipal<M, B>;
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
    this.__revocationEpoch++;
    await this._cacheInvalidate('apiKey', keyId);
    // The key may also live in the principal cache via id-based authz.
    await this._cacheInvalidate('principal', keyId);
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
    const { principal } = await this.verifyCredentials(
      credentials.identifier,
      credentials.password,
    );
    const session = await this.__mintSession(principal.id);
    this._emit('login', principal, 'PASSWORD');
    return { principal, session };
  }

  /**
   * The identity half of {@link login}: prove `identifier` + `password`
   * WITHOUT minting a session. Failure semantics are login's exactly
   * (collapsed `INVALID_CREDENTIALS` with dummy-hash burn, `NOT_ACTIVE`
   * only post-verification, `loginFailed` emitted on auth failures).
   * `mfaRequired` says whether the user carries an MFA secret — the
   * seam for app-owned flows:
   *
   * ```ts ignore
   * const { principal, mfaRequired } = await pact.verifyCredentials(email, pw);
   * if (mfaRequired && !await pact.verifyMFA(principal.id, code)) throw ...;
   * const result = await pact.createSession(principal.id);
   * ```
   *
   * @throws {PactError} `INVALID_CREDENTIALS` / `NOT_ACTIVE` /
   *   `INVALID_GRANTS` / `MISSING_HOOK` as in {@link login}.
   */
  public async verifyCredentials(
    identifier: string,
    password: string,
  ): Promise<PactVerifiedCredentials<M, B>> {
    let user: PactStoredUser;
    try {
      user = await this.__verifyPassword(identifier, password);
    } catch (error) {
      if (
        error instanceof PactError && PACT_AUTH_FAILURE_CODES.has(error.code)
      ) {
        this._emit('loginFailed', identifier, error.code);
      }
      throw error;
    }
    const principal = await this.__resolveUserPrincipal(user);
    return {
      principal: this.__bind(principal),
      mfaRequired: user.mfaSecret !== undefined,
    };
  }

  /**
   * The mint half of {@link login}: create a session for an ACTIVE user
   * by id, no credential proof — the caller vouches for identity. The
   * seam for MFA-gated logins (after {@link verifyCredentials} +
   * `verifyMFA`), magic links, and impersonation — gate it accordingly;
   * pact asks no questions here. `metadata` is stored on the session
   * record; `method` labels the emitted `login` event (default
   * `'DIRECT'`).
   *
   * @throws {PactError} `INVALID_CREDENTIALS` when `userId` does not
   *   resolve to an active USER principal (API keys hold no sessions);
   *   `MISSING_HOOK` when no session store exists.
   */
  public async createSession(userId: string, options?: {
    metadata?: Readonly<Record<string, unknown>>;
    method?: string;
  }): Promise<PactLoginResult<M>> {
    const principal = await this._resolvePrincipal(userId);
    if (principal === null || principal.kind !== 'USER') {
      throw new PactError('INVALID_CREDENTIALS');
    }
    const session = await this.__mintSession(userId, options?.metadata);
    const bound = this.__bind(principal);
    this._emit('login', bound, options?.method ?? 'DIRECT');
    return { principal: bound, session };
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
        this._emit(
          'loginFailed',
          `${provider}:${profile.id}`,
          'OAUTH_UNLINKED',
        );
        throw new PactError('OAUTH_UNLINKED', {
          provider,
          subject: profile.id,
        });
      }
      const createUser = this._hooks.createUser;
      if (createUser === undefined) {
        throw new PactError('MISSING_HOOK', { hook: 'createUser' });
      }
      // The provider email becomes the identifier ONLY when the
      // provider vouches for it — an unverified address must not be
      // able to claim (and potentially hijack) an existing local
      // identifier. And unlike register(), provisioning used to skip
      // the existence check entirely: enforce it here too, so an OAuth
      // first-login can never clobber an established account. Linking
      // an existing account to a provider stays an explicit app flow.
      const identifier = profile.email !== undefined &&
          profile.emailVerified === true
        ? profile.email
        : `${provider}:${profile.id}`;
      if (await getUser({ by: 'IDENTIFIER', identifier }) !== null) {
        throw new PactError('USER_EXISTS', { identifier });
      }
      user = await createUser({
        identifier,
        status: this.activeStatuses[0]!,
        grants: serializeGrants({}),
        oauth: { provider, subject: profile.id, profile },
      });
    }
    if (!this.__activeStatusSet.has(user.status)) {
      this._emit('loginFailed', `${provider}:${profile.id}`, 'NOT_ACTIVE');
      throw new PactError('NOT_ACTIVE', {
        status: user.status,
        userId: user.id,
      });
    }
    const principal = await this.__resolveUserPrincipal(user);
    const session = await this.__mintSession(user.id);
    this._emit('login', principal, provider);
    return { principal, session, profile };
  }

  /**
   * Validate one per-request credential and produce the authentication
   * envelope. The framework adapter EXTRACTS the credential from
   * transport — pact only validates. Authentication failures throw the
   * codes in `PACT_AUTH_FAILURE_CODES` (map those to 401, rethrow
   * everything else): `INVALID_CREDENTIALS` collapses unknown/wrong for
   * every scheme, `SESSION_EXPIRED` is the one distinct-UX failure, and
   * `NOT_ACTIVE` gates statuses post-verification. A bearer session
   * whose user vanished or went inactive collapses into
   * `INVALID_CREDENTIALS` — the re-login then reports the precise
   * reason.
   *
   * @throws {PactError} auth failures as above; `MISSING_HOOK` /
   *   `INVALID_GRANTS` for config/storage problems — those are NOT
   *   401s.
   */
  public async authenticate(
    credential: PactCredential,
  ): Promise<PactAuthContext<M, B>> {
    try {
      // Runtime junk from untyped callers — a null credential, a junk
      // scheme, or non-string/empty FIELDS — must all fail closed as
      // 401s, never escape as raw TypeErrors (500s). This also rejects
      // empty secrets/payloads outright ('' === '' would otherwise
      // compare equal against a junk stored record).
      if (credential === null || typeof credential !== 'object') {
        throw new PactError('INVALID_CREDENTIALS');
      }
      switch (credential.scheme) {
        case 'BEARER':
          this.__requireCredentialStrings(credential.token);
          return await this.__authBearer(credential.token);
        case 'BASIC':
          this.__requireCredentialStrings(
            credential.identifier,
            credential.password,
          );
          return await this.__authBasic(
            credential.identifier,
            credential.password,
          );
        case 'APIKEY':
          this.__requireCredentialStrings(credential.keyId, credential.secret);
          return await this.__authApiKey(credential.keyId, credential.secret);
        case 'HMAC':
          this.__requireCredentialStrings(
            credential.keyId,
            credential.signature,
            credential.payload,
          );
          return await this.__authHmac(credential);
        default:
          throw new PactError('INVALID_CREDENTIALS');
      }
    } catch (error) {
      if (
        error instanceof PactError && PACT_AUTH_FAILURE_CODES.has(error.code)
      ) {
        this._emit(
          'authenticateFailed',
          typeof credential?.scheme === 'string'
            ? credential.scheme
            : 'UNKNOWN',
          error.code,
        );
      }
      throw error;
    }
  }

  /**
   * End one session: delete it from the app store (when the hook
   * exists) and evict it from the session cache. Idempotent — an
   * unknown or already-ended token is a no-op.
   */
  public async logout(token: string): Promise<void> {
    let id: string;
    if (this._getOption('session')?.strategy === 'JWT') {
      try {
        // Signature-verified so a forged token cannot end someone
        // else's family — but expiry is IGNORED: logging out with an
        // expired access token must still kill the refresh family, or
        // "logout" silently leaves the account refreshable for days.
        id = (await this.__verifyJwt(token, 'ACCESS', {
          ignoreExpiration: true,
        })).sid;
      } catch {
        return; // idempotent: a forged/malformed token ends nothing
      }
    } else {
      id = await sha256(token);
    }
    await this._hooks.deleteSession?.(id);
    await this._cacheInvalidate('session', id);
    this._emit('logout', id);
  }

  /**
   * Rotate a refresh token (JWT strategy only): a current-generation
   * token advances the family and returns a fresh access + refresh
   * pair; the immediately-previous generation within the grace window
   * is re-issued without advancing (absorbing concurrent refreshes);
   * anything older is REUSE — the whole family is revoked, the
   * `refreshReused` event fires, and `REFRESH_REUSED` is thrown.
   *
   * @throws {PactError} `INVALID_OPTION` outside the JWT strategy;
   *   `INVALID_CREDENTIALS` / `SESSION_EXPIRED` / `REFRESH_REUSED` as
   *   auth failures; `MISSING_HOOK` for config problems.
   */
  public async refresh(refreshToken: string): Promise<PactLoginResult<M>> {
    const cfg = this._getOption('session');
    if (cfg?.strategy !== 'JWT') {
      throw new PactError('INVALID_OPTION', {
        option: 'session.strategy',
        reason: 'refresh requires the JWT session strategy',
      });
    }
    const payload = await this.__verifyJwt(refreshToken, 'REFRESH');
    // AUTHORITATIVE read: a reuse verdict revokes the whole family, so
    // it must never rest on a possibly-stale cached generation (a
    // read-through race or a swallowed cache write would make an honest
    // current-generation token look like theft).
    const session = await this.__getSessionAuthoritative(payload.sid);
    if (session === null) throw new PactError('INVALID_CREDENTIALS');
    if (this.__sessionExpired(session)) {
      await this.__dropSession(payload.sid);
      throw new PactError('SESSION_EXPIRED');
    }
    const presented = payload.gen ?? -1;
    const current = session.generation ?? 0;
    const graceMs = (cfg.refresh?.grace ?? 30) * 1000;
    let issueAt: number;
    if (presented === current) {
      issueAt = current + 1;
      await this.__storeSession({
        ...session,
        generation: issueAt,
        rotatedAt: new Date(),
      });
    } else if (
      presented === current - 1 && session.rotatedAt !== undefined &&
      Date.now() - session.rotatedAt.getTime() <= graceMs
    ) {
      // Concurrent-refresh race: both callers end up on the CURRENT
      // generation; no rotation, no reuse verdict.
      issueAt = current;
    } else {
      await this.__dropSession(payload.sid);
      this._emit('refreshReused', payload.sid, session.userId);
      throw new PactError('REFRESH_REUSED', {
        sessionId: payload.sid,
        userId: session.userId,
      });
    }
    const principal = await this._resolvePrincipal(session.userId);
    if (principal === null) throw new PactError('INVALID_CREDENTIALS');
    return {
      principal,
      session: await this.__issueJwtPair(session.userId, payload.sid, issueAt),
    };
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
    await saveResetToken({
      id: await sha256(token),
      userId: user.id,
      expiresAt,
    });
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
    if (record === null || this.__sessionExpired(record)) {
      return false;
    }
    await this.setPassword(record.userId, newPassword);
    return true;
  }

  /** Generate one API key pair: `<prefix>_ak_` id + `<prefix>_as_`
   * secret. {@link issueApiKey} calls this; use it directly when the app
   * owns persistence. */
  public generateAPIKeyPair(): { key: string; secret: string } {
    return {
      key: this._generateSecret('ak', 16),
      secret: this._generateSecret('as', 32),
    };
  }

  /** Generate one `<prefix>_pr_` password-reset token (store only its
   * sha-256 — see {@link requestPasswordReset}). */
  public generatePasswordResetToken(): string {
    return this._generateSecret('pr', 32);
  }

  /** Generate one `<prefix>_st_` opaque session token (stored by
   * sha-256). */
  public generateSessionToken(): string {
    return this._generateSecret('st', 32);
  }

  /** Generate one `<prefix>_rt_` opaque refresh token. */
  public generateRefreshToken(): string {
    return this._generateSecret('rt', 32);
  }

  /**
   * TOTP seeds are unprefixed canonical base32 (20 bytes = 160 bits, the
   * RFC 4226 recommendation): authenticator apps and otpauth:// URLs expect
   * base32, and a prefix would corrupt the seed. 20 bytes = 32 base32 chars
   * (whole 40-bit groups), so the URL secret round-trips byte-identical.
   */
  public generateMFASecret(): string {
    return generateBase32Secret(20);
  }

  /** Build the `otpauth://totp/...` enrollment URL an authenticator app
   * scans (via QR) for `secret` — pair with {@link generateMFASecret}. */
  public generateMFAAuthURL(
    secret: string,
    accountName: string,
    issuer: string,
  ): string {
    return generateOTPAuthURL({ type: 'totp', secret, accountName, issuer });
  }

  /**
   * Start a passkey registration ceremony for an existing active user —
   * an authenticated flow (adding a passkey to an account, or right
   * after signup); the caller vouches for `userId`. Returns the
   * creation options for `navigator.credentials.create` plus the
   * challenge the app must stash and hand back to
   * {@link finishPasskeyRegistration} — pact holds no state between the
   * two calls.
   *
   * @throws {PactError} `INVALID_OPTION` when passkeys are not
   *   configured; `PASSKEY_REGISTRATION_FAILED` for an unknown or
   *   inactive user.
   */
  public async beginPasskeyRegistration(
    userId: string,
    displayName?: string,
  ): Promise<{ options: PactPasskeyCreationOptions; challenge: string }> {
    const cfg = this.__requirePasskeys();
    await this.__requireActivePasskeyUser(userId);
    const handle = new TextEncoder().encode(userId);
    // WebAuthn caps user handles at 64 bytes; over it the browser fails
    // credentials.create with an undiagnosable TypeError — reject here.
    if (handle.length > 64) {
      throw new PactError('PASSKEY_REGISTRATION_FAILED', {
        reason: 'userId exceeds the 64-byte WebAuthn user-handle limit',
      });
    }
    const existing = await this._hooks.getPasskeys!(userId);
    const challenge = this.__passkeyChallenge();
    const name = displayName ?? userId;
    return {
      options: {
        rp: { id: cfg.rpId, name: cfg.rpName },
        user: {
          id: encodeBase64Url(handle),
          name,
          displayName: name,
        },
        challenge,
        pubKeyCredParams: [...cfg.algorithms].map((algorithm) => ({
          type: 'public-key',
          alg: COSE_BY_ALGORITHM[algorithm],
        })),
        timeout: cfg.timeout,
        excludeCredentials: existing.map((passkey) => ({
          type: 'public-key',
          id: passkey.id,
          ...(passkey.transports === undefined
            ? {}
            : { transports: passkey.transports }),
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: cfg.userVerification.toLowerCase() as
            | 'required'
            | 'preferred'
            | 'discouraged',
        },
        attestation: 'none',
      },
      challenge,
    };
  }

  /**
   * Verify the browser's registration result and persist the passkey
   * via `savePasskey`. Returns the stored record (nothing in it is
   * secret).
   *
   * The challenge is the ONLY link between begin and finish, and pact
   * does not bind it to a user — the app must: either authenticate this
   * call as the same `userId` the ceremony was begun for, or key its
   * challenge stash by user and ceremony kind. Under attestation policy
   * 'none' a registration response is constructible without an
   * authenticator, so an unbound finish endpoint would let anyone
   * attach their passkey to any account.
   *
   * @throws {PactError} `PASSKEY_REGISTRATION_FAILED` with a diagnostic
   *   reason on any ceremony failure (challenge/origin/rpId mismatch,
   *   malformed attestation, disabled algorithm, duplicate credential,
   *   unknown or inactive user); `INVALID_OPTION` when passkeys are not
   *   configured.
   */
  public async finishPasskeyRegistration(
    userId: string,
    response: PactPasskeyRegistrationResponse,
    expected: { challenge: string },
  ): Promise<PactStoredPasskey> {
    const cfg = this.__requirePasskeys();
    // Re-checked here, not only at begin: the user may have been
    // deactivated between the two calls, and a finish for a nonexistent
    // id must not persist a credential.
    await this.__requireActivePasskeyUser(userId);
    const verified = await verifyRegistrationCeremony(
      response,
      expected?.challenge ?? '',
      cfg,
    );
    if (await this._hooks.getPasskey!(verified.id) !== null) {
      throw new PactError('PASSKEY_REGISTRATION_FAILED', {
        reason: 'credential is already registered',
      });
    }
    const record: PactStoredPasskey = { ...verified, userId };
    await this._hooks.savePasskey!(record);
    return record;
  }

  /**
   * Start a passkey login ceremony. With an `identifier`, the returned
   * options carry the user's registered credentials in
   * `allowCredentials`; without one, the list is empty and the browser
   * offers its discoverable credentials (usernameless sign-in). An
   * unknown identifier is indistinguishable from a user with no
   * passkeys; a user WITH passkeys necessarily reveals their credential
   * ids — the inherent identifier-first tradeoff. Offer the
   * usernameless form to avoid it. Stash the challenge and hand it to
   * {@link finishPasskeyLogin}.
   *
   * @throws {PactError} `INVALID_OPTION` when passkeys are not
   *   configured.
   */
  public async beginPasskeyLogin(
    identifier?: string,
  ): Promise<{ options: PactPasskeyRequestOptions; challenge: string }> {
    const cfg = this.__requirePasskeys();
    let allowCredentials: PactPasskeyRequestOptions['allowCredentials'] = [];
    if (identifier !== undefined) {
      const user = await this._hooks.getUser!({ by: 'IDENTIFIER', identifier });
      if (user !== null && this.__activeStatusSet.has(user.status)) {
        allowCredentials = (await this._hooks.getPasskeys!(user.id)).map(
          (passkey) => ({
            type: 'public-key',
            id: passkey.id,
            ...(passkey.transports === undefined
              ? {}
              : { transports: passkey.transports }),
          }),
        );
      }
    }
    const challenge = this.__passkeyChallenge();
    return {
      options: {
        challenge,
        rpId: cfg.rpId,
        timeout: cfg.timeout,
        userVerification: cfg.userVerification.toLowerCase() as
          | 'required'
          | 'preferred'
          | 'discouraged',
        allowCredentials,
      },
      challenge,
    };
  }

  /**
   * Verify a passkey assertion and mint a session for the credential's
   * owner (through {@link createSession}; the `login` event fires with
   * method `'PASSKEY'`). Every verification failure — unknown
   * credential, challenge/origin mismatch, bad signature, suspected
   * clone — collapses into the same `INVALID_CREDENTIALS`; a counter
   * regression additionally emits `passkeyCloneSuspected` server-side.
   *
   * @throws {PactError} `INVALID_CREDENTIALS` as above (a 401);
   *   `INVALID_OPTION` when passkeys are not configured;
   *   `MISSING_HOOK` when no session store exists.
   */
  public async finishPasskeyLogin(
    response: PactPasskeyAssertionResponse,
    expected: { challenge: string },
  ): Promise<PactLoginResult<M>> {
    const cfg = this.__requirePasskeys();
    // Credential ids are at most 1023 bytes (1364 base64url chars) —
    // anything longer is junk and must not reach store hooks or event
    // listeners as an unbounded attacker-controlled string.
    const credentialId =
      typeof response?.id === 'string' && response.id.length <= 1364
        ? response.id
        : '';
    try {
      const passkey = credentialId === ''
        ? null
        : await this._hooks.getPasskey!(credentialId);
      if (passkey === null) throw new PactError('INVALID_CREDENTIALS');
      if (!this.__userHandleMatches(response, passkey.userId)) {
        throw new PactError('INVALID_CREDENTIALS');
      }
      const verdict = await verifyAssertionCeremony(
        response,
        expected?.challenge ?? '',
        cfg,
        passkey,
      );
      if (!verdict.valid) {
        if (verdict.cloneSuspected) {
          this._emit('passkeyCloneSuspected', passkey.id, passkey.userId);
        }
        throw new PactError('INVALID_CREDENTIALS');
      }
      if (verdict.signCount > passkey.signCount) {
        await this._hooks.updatePasskeyCounter!(passkey.id, verdict.signCount);
      }
      return await this.createSession(passkey.userId, { method: 'PASSKEY' });
    } catch (error) {
      if (
        error instanceof PactError && PACT_AUTH_FAILURE_CODES.has(error.code)
      ) {
        this._emit('loginFailed', `passkey:${credentialId}`, error.code);
      }
      throw error;
    }
  }

  /** Both registration ceremonies require an existing, active user. */
  private async __requireActivePasskeyUser(userId: string): Promise<void> {
    const user = await this._hooks.getUser!({ by: 'ID', id: userId });
    if (user === null || !this.__activeStatusSet.has(user.status)) {
      throw new PactError('PASSKEY_REGISTRATION_FAILED', {
        reason: 'unknown or inactive user',
      });
    }
  }

  /** The passkey feature gate: configured settings or a loud refusal. */
  private __requirePasskeys(): NormalizedPasskeyConfig {
    if (this.__passkeys === undefined) {
      throw new PactError('INVALID_OPTION', {
        option: 'passkeys',
        reason: 'passkey ceremonies require the passkeys option block',
      });
    }
    return this.__passkeys;
  }

  /** 32 random bytes as an unpadded base64url challenge. */
  private __passkeyChallenge(): string {
    return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  }

  /** A discoverable-credential userHandle, when present, must decode to
   * the stored owner id. */
  private __userHandleMatches(
    response: PactPasskeyAssertionResponse,
    userId: string,
  ): boolean {
    const handle = response?.response?.userHandle;
    if (handle === undefined || handle === null || handle === '') return true;
    try {
      return new TextDecoder().decode(decodeBase64Url(handle)) === userId;
    } catch {
      return false;
    }
  }

  /**
   * Verify a TOTP code against the user's enrolled seed. Returns
   * `false` for a wrong code, an unenrolled or non-active user, an
   * unknown id, or a corrupt seed — fail-closed, boolean like a check.
   * Seed generation lives in {@link generateMFASecret} /
   * {@link generateMFAAuthURL}; persisting the seed (encrypted at rest)
   * is the application's write. NOTE: verification is stateless — a
   * code verifies repeatedly within its ±30s window, so applications
   * that must reject replays (RFC 6238 §5.2) have to record the last
   * accepted code/step themselves for now.
   *
   * @throws {PactError} `MISSING_HOOK` without `getUser`.
   */
  public async verifyMFA(userId: string, code: string): Promise<boolean> {
    const getUser = this._hooks.getUser;
    if (getUser === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'getUser' });
    }
    const user = await getUser({ by: 'ID', id: userId });
    if (
      user === null || user.mfaSecret === undefined ||
      !this.__activeStatusSet.has(user.status)
    ) {
      return false;
    }
    try {
      return await verifyTOTP(code, user.mfaSecret);
    } catch {
      // A corrupt stored seed must honor the boolean contract, not 500.
      return false;
    }
  }

  /**
   * HMAC-sign outbound content (webhook bodies, signed URLs, download
   * links). Without an explicit `key` the signing key is DERIVED from
   * the JWT session secret via HKDF under a content-signing label, so a
   * content signature and a session token can never validate each
   * other. Pass `key` to sign without the JWT strategy or to scope keys
   * per consumer.
   *
   * @throws {PactError} `INVALID_OPTION` when neither an explicit `key`
   *   nor a `session.secret` is configured.
   */
  public async sign(content: string, key?: string): Promise<string> {
    return await signHMAC(content, key ?? await this.__contentKey());
  }

  /**
   * Verify a signature produced by {@link sign}. Returns `false` on a
   * mismatch AND on malformed signature material — attacker-controlled
   * garbage must never 500 the caller.
   *
   * @throws {PactError} `INVALID_OPTION` as in {@link sign}.
   */
  public async verifySignature(
    content: string,
    signature: string,
    key?: string,
  ): Promise<boolean> {
    const resolved = key ?? await this.__contentKey();
    try {
      return await verifyHMAC(content, signature, resolved);
    } catch {
      return false;
    }
  }

  /**
   * Evict one principal from the cache and stale-mark every outstanding
   * bound principal (each re-resolves at its next check). Grants live in
   * app storage where pact cannot see writes, so call this after
   * changing an actor's grants/status to make the change take effect
   * immediately instead of after the TTL / freshness window.
   */
  public invalidatePrincipal(id: string): Promise<void> {
    this.__revocationEpoch++;
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
    this.__revocationEpoch++;
    await Promise.all(
      [...this.__caches.keys()].map((type) => this._cacheClear(type)),
    );
  }

  /**
   * Both options are optional — only well-formedness is rejected here; deep
   * cache validation belongs to Cacher when the engine is created.
   */
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
          this.__validateSessionOption(
            value as NonNullable<PactOptions['session']>,
          );
          break;
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

  /**
   * The cacher instance name is the key namespace and a deployment-wide
   * contract, rooted at the instance `name` from the create definition —
   * structural identity, not a cache tunable. Protected seam kept so
   * test subclasses can still override for isolation.
   */
  protected _cacheName(): string {
    return this.name;
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
    // Fail closed on junk ids: cacher normalizes keys by trimming, so a
    // padded id like ' admin' would otherwise hit admin's warm cache
    // entry while the cold path resolves someone else (or nobody).
    if (typeof id !== 'string' || id.length === 0 || id !== id.trim()) {
      return null;
    }
    const { getApiKey, getPrincipal, getUser } = this._hooks;
    if (
      getPrincipal === undefined && getUser === undefined &&
      getApiKey === undefined
    ) {
      throw new PactError('MISSING_HOOK', {
        hook: 'getPrincipal, getUser, or getApiKey',
      });
    }
    const cached = await this._cacheGet<PactPrincipal<M>>('principal', id);
    if (cached !== undefined) return cached;
    let principal = await this.__resolveUserActor(id);
    // Actor ids share one namespace, so an id that is not a user may be
    // an API key — without this fallback, id-based authz would silently
    // be user-only and every key-authenticated request would 403.
    if (principal === null && getApiKey !== undefined) {
      const key = await this.__getApiKey(id);
      if (key !== null) {
        principal = this.__keyToPrincipal(key);
        // Owner linkage: a key owned by a user who can no longer
        // authorize must not authorize either. Resolved WITHOUT the key
        // fallback, so a crafted userId-points-at-a-key cycle fails
        // closed instead of recursing.
        if (
          principal !== null && key.userId !== undefined &&
          (getPrincipal !== undefined || getUser !== undefined) &&
          await this.__ownerPrincipal(key.userId) === null
        ) {
          principal = null;
        }
      }
    }
    if (principal === null) return null;
    await this._cacheSet('principal', id, principal);
    return principal;
  }

  /**
   * User-only resolution (getPrincipal, else getUser) — no cache read,
   * no key fallback.
   */
  private async __resolveUserActor(
    id: string,
  ): Promise<PactPrincipal<M> | null> {
    const { getPrincipal, getUser } = this._hooks;
    if (getPrincipal !== undefined) return await getPrincipal(id);
    if (getUser !== undefined) {
      return this.__toPrincipal(await getUser({ by: 'ID', id }));
    }
    return null;
  }

  /**
   * Cache-aware user-only resolution for a key's owner.
   */
  private async __ownerPrincipal(
    userId: string,
  ): Promise<PactPrincipal<M> | null> {
    const cached = await this._cacheGet<PactPrincipal<M>>('principal', userId);
    if (cached !== undefined) return cached;
    const owner = await this.__resolveUserActor(userId);
    if (owner !== null) await this._cacheSet('principal', userId, owner);
    return owner;
  }

  /**
   * Gate a key on its OWNER: when the key carries a userId and a user
   * hook exists, an inactive or vanished owner denies — suspending a
   * user must suspend their keys. Without user hooks the linkage is
   * informational (there is nothing to check it against).
   *
   * @throws {PactError} `NOT_ACTIVE` with the owner's actual status;
   *   `INVALID_CREDENTIALS` when the owner record vanished;
   *   `INVALID_GRANTS` when the owner exists, is active, but carries
   *   corrupt grants.
   */
  private async __requireActiveOwner(key: PactStoredApiKey): Promise<void> {
    const { getPrincipal, getUser } = this._hooks;
    if (
      key.userId === undefined ||
      (getPrincipal === undefined && getUser === undefined)
    ) {
      return;
    }
    if (await this.__ownerPrincipal(key.userId) !== null) return;
    // Deny path only: fetch the record for a precise status when we
    // can; a vanished owner collapses like a vanished bearer user.
    const owner = getUser !== undefined
      ? await getUser({ by: 'ID', id: key.userId })
      : null;
    if (owner === null) throw new PactError('INVALID_CREDENTIALS');
    if (!this.__activeStatusSet.has(owner.status)) {
      throw new PactError('NOT_ACTIVE', {
        status: owner.status,
        userId: owner.id,
      });
    }
    throw new PactError('INVALID_GRANTS', {
      reason: `stored grants for user '${owner.id}' are malformed`,
    });
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

  /** One `<secretPrefix>_<tag>_<hex>` secret — the shared shape behind
   * every generate* method; protected so subclasses can mint their own
   * tagged kinds. */
  protected _generateSecret(tag: string, byteLength: number): string {
    const prefix = this._getOption('secretPrefix') ?? 'pact';
    return `${prefix}_${tag}_${generateHexSecret(byteLength)}`;
  }

  /**
   * Resolution WHITELIST: only id/kind/grants/metadata survive — the
   * stored record's credentials and extra fields never reach a principal
   * (which is cached, logged, and handed to app code). A status outside
   * activeStatuses and corrupt stored grants both deny (null) rather
   * than throw: storage state must not 500 the request path.
   */
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

  /** Every credential field must be a non-empty string — 401 otherwise. */
  private __requireCredentialStrings(...values: unknown[]): void {
    for (const value of values) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new PactError('INVALID_CREDENTIALS');
      }
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

  /**
   * Mint + store one session under the configured strategy — shared by
   * password and OAuth logins so the session contract cannot drift
   * between entry points. OPAQUE: token stored by its sha-256. JWT: the
   * stored record is the refresh FAMILY (generation 0) and the tokens
   * are signed, not stored.
   */
  private async __mintSession(
    userId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<{ token: string; expiresAt: Date; refreshToken?: string }> {
    const cfg = this._getOption('session');
    if (cfg?.strategy === 'JWT') {
      const familyTtl = cfg.refresh?.ttl ?? 10_080;
      const sid = generateHexSecret(16);
      await this.__storeSession({
        id: sid,
        userId,
        expiresAt: new Date(Date.now() + familyTtl * 60_000),
        generation: 0,
        rotatedAt: new Date(),
        metadata,
      });
      return await this.__issueJwtPair(userId, sid, 0);
    }
    const ttl = cfg?.ttl ?? 480;
    const expiresAt = new Date(Date.now() + ttl * 60_000);
    const token = this.generateSessionToken();
    await this.__storeSession({
      id: await sha256(token),
      userId,
      expiresAt,
      metadata,
    });
    return { token, expiresAt };
  }

  /**
   * One access + refresh pair for a session family at a generation.
   */
  private async __issueJwtPair(
    userId: string,
    sid: string,
    gen: number,
  ): Promise<{ token: string; expiresAt: Date; refreshToken: string }> {
    const cfg = this._getOption('session');
    const secret = cfg?.secret;
    if (secret === undefined) {
      throw new PactError('INVALID_OPTION', {
        option: 'session.secret',
        reason: 'the JWT session strategy requires a signing secret',
      });
    }
    const expiresAt = new Date(Date.now() + (cfg?.ttl ?? 480) * 60_000);
    const refreshExpiry = new Date(
      Date.now() + (cfg?.refresh?.ttl ?? 10_080) * 60_000,
    );
    const token = await issueJWT('HS256', {
      sub: userId,
      sid,
      use: 'ACCESS',
      exp: Math.floor(expiresAt.getTime() / 1000),
    }, secret);
    const refreshToken = await issueJWT('HS256', {
      sub: userId,
      sid,
      use: 'REFRESH',
      gen,
      exp: Math.floor(refreshExpiry.getTime() / 1000),
    }, secret);
    return { token, expiresAt, refreshToken };
  }

  /**
   * Verify one of our own HS256 session JWTs and pin its `use` claim —
   * an access token can never pass as a refresh token or vice versa.
   */
  private async __verifyJwt(
    token: string,
    use: 'ACCESS' | 'REFRESH',
    options: { ignoreExpiration?: boolean } = {},
  ): Promise<{ sub: string; sid: string; gen?: number }> {
    const secret = this._getOption('session')?.secret;
    if (secret === undefined) {
      throw new PactError('INVALID_OPTION', {
        option: 'session.secret',
        reason: 'the JWT session strategy requires a signing secret',
      });
    }
    let payload: Record<string, unknown>;
    try {
      payload = await verifyJWT(token, secret, {
        algorithm: 'HS256',
        ...(options.ignoreExpiration === true
          ? { ignoreExpiration: true }
          : {}),
      }) as Record<string, unknown>;
    } catch (error) {
      if (
        error instanceof JWTError && error.context.code === 'EXPIRED_TOKEN'
      ) {
        throw new PactError('SESSION_EXPIRED');
      }
      throw new PactError('INVALID_CREDENTIALS');
    }
    if (
      payload.use !== use || typeof payload.sid !== 'string' ||
      typeof payload.sub !== 'string'
    ) {
      throw new PactError('INVALID_CREDENTIALS');
    }
    return {
      sub: payload.sub,
      sid: payload.sid,
      gen: typeof payload.gen === 'number' ? payload.gen : undefined,
    };
  }

  /**
   * Best-effort family teardown (reuse detection, expiry cleanup).
   */
  private async __dropSession(sid: string): Promise<void> {
    try {
      await this._hooks.deleteSession?.(sid);
    } catch {
      // best-effort — the caller's verdict stands on its own
    }
    await this._cacheInvalidate('session', sid);
  }

  /**
   * Shared credential core for login() and BASIC authenticate:
   * timing-equalized lookup + verify, then the status gate — NOT_ACTIVE
   * is only reachable after the password verified.
   */
  private async __verifyPassword(
    identifier: string,
    password: string,
  ): Promise<PactStoredUser> {
    const getUser = this._hooks.getUser;
    if (getUser === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'getUser' });
    }
    const user = await getUser({ by: 'IDENTIFIER', identifier });
    // Truthiness deliberately: an EMPTY stored hash must also burn the
    // dummy pbkdf2, or those accounts fail measurably faster.
    const hash = user?.passwordHash || await this.__getDummyHash();
    const verified = await pbkdf2Verify(password, hash);
    if (user === null || user.passwordHash === undefined || !verified) {
      throw new PactError('INVALID_CREDENTIALS');
    }
    if (!this.__activeStatusSet.has(user.status)) {
      throw new PactError('NOT_ACTIVE', {
        status: user.status,
        userId: user.id,
      });
    }
    return user;
  }

  /**
   * Whitelist a stored user into a cached principal — callers gate
   * status FIRST, so a null from __toPrincipal here is unambiguously
   * corrupt grants and throws loudly (flows differ from authz's silent
   * fail-closed).
   */
  private async __resolveUserPrincipal(
    user: PactStoredUser,
  ): Promise<PactPrincipal<M>> {
    const principal = this.__toPrincipal(user);
    if (principal === null) {
      throw new PactError('INVALID_GRANTS', {
        reason: `stored grants for user '${user.id}' are malformed`,
      });
    }
    await this._cacheSet('principal', principal.id, principal);
    return principal;
  }

  /** BEARER scheme: JWT-strategy verify (use-claim pinned) or opaque
   * sha-256 lookup, then principal resolution. */
  private async __authBearer(token: string): Promise<PactAuthContext<M, B>> {
    if (this._getOption('session')?.strategy === 'JWT') {
      const payload = await this.__verifyJwt(token, 'ACCESS');
      const session = await this.__getSession(payload.sid);
      // A missing record means the family was revoked (logout / reuse).
      if (session === null) throw new PactError('INVALID_CREDENTIALS');
      if (this.__sessionExpired(session)) {
        await this.__dropSession(payload.sid);
        throw new PactError('SESSION_EXPIRED');
      }
      const principal = await this._resolvePrincipal(payload.sub);
      if (principal === null) throw new PactError('INVALID_CREDENTIALS');
      return {
        principal: this.__bind(principal),
        via: 'SESSION',
        sessionId: payload.sid,
      };
    }
    const sessionId = await sha256(token);
    const session = await this.__getSession(sessionId);
    if (session === null) throw new PactError('INVALID_CREDENTIALS');
    if (this.__sessionExpired(session)) {
      // Best-effort cleanup — the expiry verdict must not depend on it.
      try {
        await this._hooks.deleteSession?.(sessionId);
      } catch {
        // ignore: the throw below stands on its own
      }
      await this._cacheInvalidate('session', sessionId);
      throw new PactError('SESSION_EXPIRED');
    }
    const principal = await this._resolvePrincipal(session.userId);
    if (principal === null) throw new PactError('INVALID_CREDENTIALS');
    return { principal: this.__bind(principal), via: 'SESSION', sessionId };
  }

  /** BASIC scheme: full password verification per request, no session
   * minted. */
  private async __authBasic(
    identifier: string,
    password: string,
  ): Promise<PactAuthContext<M, B>> {
    const user = await this.__verifyPassword(identifier, password);
    const principal = await this.__resolveUserPrincipal(user);
    return { principal: this.__bind(principal), via: 'BASIC' };
  }

  /** APIKEY scheme: constant-time secret comparison against the stored
   * raw secret, then the owner gate. */
  private async __authApiKey(
    keyId: string,
    secret: string,
  ): Promise<PactAuthContext<M, B>> {
    const key = await this.__getApiKey(keyId);
    if (key === null || !constantTimeEqual(secret, key.secret)) {
      throw new PactError('INVALID_CREDENTIALS');
    }
    const principal = this.__keyPrincipal(key);
    await this.__requireActiveOwner(key);
    return { principal: this.__bind(principal), via: 'APIKEY' };
  }

  /** HMAC scheme: recompute the signature over the caller-canonicalized
   * payload with the key's raw secret; malformed material is a 401,
   * never a 500. */
  private async __authHmac(credential: {
    keyId: string;
    signature: string;
    payload: string;
  }): Promise<PactAuthContext<M, B>> {
    const key = await this.__getApiKey(credential.keyId);
    if (key === null) throw new PactError('INVALID_CREDENTIALS');
    let valid = false;
    try {
      valid = await verifyHMAC(
        credential.payload,
        credential.signature,
        key.secret,
      );
    } catch {
      // Malformed signature material must 401, not 500.
    }
    if (!valid) throw new PactError('INVALID_CREDENTIALS');
    const principal = this.__keyPrincipal(key);
    await this.__requireActiveOwner(key);
    return { principal: this.__bind(principal), via: 'HMAC' };
  }

  /**
   * Read-through session lookup: cache first, then the getSession hook
   * (caching the hit). Cache-only mode treats the session engine as the
   * store; with neither, bearer validation is unconfigured.
   */
  private async __getSession(id: string): Promise<PactStoredSession | null> {
    const cached = await this._cacheGet<PactStoredSession>('session', id);
    if (cached !== undefined) return cached;
    const hook = this._hooks.getSession;
    if (hook !== undefined) {
      const session = await hook(id);
      if (session !== null) await this._cacheSet('session', id, session);
      return session;
    }
    if (this.__caches.get('session') === undefined) {
      throw new PactError('MISSING_HOOK', {
        hook: 'getSession (or a session cache TTL > 0)',
      });
    }
    return null;
  }

  /**
   * Read-through API-key lookup: cache first, then the getApiKey hook.
   */
  private async __getApiKey(keyId: string): Promise<PactStoredApiKey | null> {
    const cached = await this._cacheGet<PactStoredApiKey>('apiKey', keyId);
    if (cached !== undefined) return cached;
    const hook = this._hooks.getApiKey;
    if (hook === undefined) {
      throw new PactError('MISSING_HOOK', { hook: 'getApiKey' });
    }
    const key = await hook(keyId);
    if (key !== null) await this._cacheSet('apiKey', keyId, key);
    return key;
  }

  /**
   * Whitelist an API-key record into its principal — fail-closed null
   * on a non-active status or corrupt grants (the resolution-path
   * contract, mirroring __toPrincipal).
   */
  private __keyToPrincipal(key: PactStoredApiKey): PactPrincipal<M> | null {
    if (!this.__activeStatusSet.has(key.status)) return null;
    try {
      const grants = deserializeGrants(key.grants) as Readonly<
        Partial<Record<M, bigint>>
      >;
      return {
        kind: 'APIKEY',
        id: key.id,
        userId: key.userId,
        grants,
        metadata: key.metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * The throwing variant for the APIKEY/HMAC authenticate schemes,
   * where the failure REASON matters (NOT_ACTIVE vs corrupt storage).
   */
  private __keyPrincipal(key: PactStoredApiKey): PactPrincipal<M> {
    if (!this.__activeStatusSet.has(key.status)) {
      throw new PactError('NOT_ACTIVE', {
        status: key.status,
        userId: key.userId ?? key.id,
      });
    }
    const principal = this.__keyToPrincipal(key);
    if (principal === null) {
      throw new PactError('INVALID_GRANTS', {
        reason: `stored grants for API key '${key.id}' are malformed`,
      });
    }
    return principal;
  }

  // Derived once per instance; hex-encoded because crypt's SigningKey
  // takes strings, not raw bytes.
  private __contentSignKey?: string;

  /** The default content-signing key: hkdf(session.secret) under the
   * 'pact:content-sign' info label, domain-separated from JWTs and
   * cached after first derivation. */
  private async __contentKey(): Promise<string> {
    if (this.__contentSignKey !== undefined) return this.__contentSignKey;
    const secret = this._getOption('session')?.secret;
    if (secret === undefined) {
      throw new PactError('INVALID_OPTION', {
        option: 'session.secret',
        reason: 'content signing without an explicit key requires the JWT ' +
          "session strategy's secret",
      });
    }
    const bytes = await hkdf(secret, { info: 'pact:content-sign' });
    this.__contentSignKey = Array.from(
      bytes,
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    return this.__contentSignKey;
  }

  // Lazily-built once so every login failure path burns real pbkdf2
  // work — unknown identifiers and password-less users must cost the
  // same as a wrong password.
  private __dummyHash?: string;

  /** A lazily-built pbkdf2 hash burned on unknown-identifier logins so
   * account existence is not measurable from response timing. */
  private async __getDummyHash(): Promise<string> {
    this.__dummyHash ??= await pbkdf2Hash(generateHexSecret(16));
    return this.__dummyHash;
  }

  /**
   * Store a minted session. With a saveSession hook the app store is
   * authoritative and the cache is a read-cache (type TTL). Without it
   * the session engine IS the store: write with the session's remaining
   * LIFETIME (not the read-cache TTL) and do NOT swallow failures — a
   * session that cannot be stored must not be handed out.
   */
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
    // Clamp: cacher treats 0 as "never expire" and throws on negatives.
    const seconds = Math.max(
      1,
      Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000),
    );
    await engine.set(session.id, encodeForCache(session), { expiry: seconds });
  }

  /**
   * Cache-only mode has no hook: the session engine IS authoritative.
   */
  private async __getSessionAuthoritative(
    id: string,
  ): Promise<PactStoredSession | null> {
    const hook = this._hooks.getSession;
    if (hook !== undefined) return await hook(id);
    return await this.__getSession(id);
  }

  /**
   * A NaN expiry (tampered/corrupt Date) must count as expired, not
   * immortal: `NaN <= now` is false, so the naive compare fails open.
   */
  private __sessionExpired(record: { expiresAt: Date }): boolean {
    const at = record.expiresAt.getTime();
    return !Number.isFinite(at) || at <= Date.now();
  }

  /**
   * Effective mask for one module — own keys only (a prototype-chain
   * name like 'constructor' must not resolve to a Function), bigints
   * only, and negative masks clamp to 0n: a sign bug in app grant
   * composition must never become all-access (-1n & bit is true for
   * every bit).
   */
  private __grantOf(
    grants: Readonly<Partial<Record<M, bigint>>> | null,
    module: M,
  ): bigint {
    if (grants === null || !Object.hasOwn(grants, module)) {
      return 0n;
    }
    const mask = grants[module];
    return typeof mask === 'bigint' && mask > 0n ? mask : 0n;
  }

  /**
   * The sync mask-level evaluation both public checks share. Throws only
   * on definition misuse (unknown module/permission, permission outside
   * the module's ceiling) — `grants` is the sole request-time input, so
   * a throw here is a programming error, never a denial. Lookups are
   * own-key guarded: bits/moduleMasks are plain objects, so a request-
   * derived name like 'constructor' would otherwise resolve to an
   * inherited Function and crash the & below as a raw TypeError.
   */
  private __evaluate(
    module: M,
    permission: keyof B,
    grants: bigint,
  ): boolean {
    const moduleMask = Object.hasOwn(this.moduleMasks, module)
      ? this.moduleMasks[module]
      : undefined;
    if (moduleMask === undefined) {
      throw new PactError('UNKNOWN_MODULE', { module });
    }
    // B[keyof B] loses its bigint-ness once narrowed (B[keyof B] & {}), which
    // breaks the & operator below — pin the lookup type instead.
    const permissionBit = Object.hasOwn(this.bits, permission)
      ? this.bits[permission] as bigint | undefined
      : undefined;
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

  /**
   * Session group: the shared ttl shape plus the JWT-strategy fields.
   */
  private __validateSessionOption(
    value: NonNullable<PactOptions['session']>,
  ): void {
    this.__validateTtlGroup('session', value);
    if (
      value.strategy !== undefined && value.strategy !== 'OPAQUE' &&
      value.strategy !== 'JWT'
    ) {
      throw new PactError('INVALID_OPTION', {
        option: 'session.strategy',
        reason: "must be 'OPAQUE' or 'JWT'",
      });
    }
    if (
      value.strategy === 'JWT' &&
      (typeof value.secret !== 'string' || value.secret.length < 32)
    ) {
      throw new PactError('INVALID_OPTION', {
        option: 'session.secret',
        reason:
          'the JWT strategy requires a signing secret of at least 32 characters',
      });
    }
    if (value.refresh !== undefined) {
      this.__validateTtlGroup('session.refresh', value.refresh);
      const grace = value.refresh.grace;
      if (
        grace !== undefined &&
        (typeof grace !== 'number' || !Number.isInteger(grace) || grace < 0 ||
          grace > 3600)
      ) {
        throw new PactError('INVALID_OPTION', {
          option: 'session.refresh.grace',
          reason: 'must be an integer number of seconds between 0 and 3600',
        });
      }
    }
  }

  /**
   * Shared shape check for the { ttl?: minutes } option groups.
   */
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

  /**
   * Well-formedness only (split from _processOption for readability);
   * engine existence and engine-option validity stay with Cacher, whose
   * rejection the constructor wraps as CACHE_INIT_FAILED.
   */
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

  /**
   * Bits are atomic capabilities: each must be a distinct single positive
   * bit. Combinations live in grants (a grant is a mask), never in the
   * definition — the single-bit invariant is what keeps every `& bit`
   * check exact (any-of vs all-of cannot diverge on one bit). A zero bit
   * can never be granted; a shared bit makes two permissions
   * indistinguishable (grant one = grant both).
   */
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

  /**
   * Validation IS resolution: an unknown permission name throws while
   * building the masks, so no separate validation pass exists to drift out
   * of sync. Unknown modules cannot exist — the keys ARE the modules.
   */
  private __resolveModuleMasks(
    modulePermissions: ModulePermissions<B>,
  ): Partial<Record<M, bigint>> {
    // Null prototype: a module literally named '__proto__' must become
    // an own key, not a silent prototype swap.
    const masks: Partial<Record<M, bigint>> = Object.create(null);
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

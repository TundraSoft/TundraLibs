/**
 * @fileoverview The PACT facade.
 *
 * `PACT` is the public engine: an `Options`-based class (typed option store +
 * `Events` emitter, the TundraLibs idiom — see `RESTler`, `Norm`) that
 * composes the pure {@link Permissions} authorization core with a token
 * layer delegated entirely to `@tundralibs/crypt` (JWT issue/verify/refresh,
 * HMAC request signing), a {@link Groups} cache over the consumer's
 * `groupResolver` hook, self-contained API-key minting, and a login seam —
 * named credential strategies plus built-in OAuth2/PKCE providers
 * ({@link OAuthClient}). Config flows through the option store; lifecycle
 * flows through events (`_on<Event>` constructor options or `.on()`).
 *
 * @example
 * ```ts
 * declare const audit: (module: string, permission: string | bigint) => void;
 *
 * const pact = new PACT({
 *   bits: { READ: 1n, EDIT: 2n, DELETE: 4n },
 *   modules: { Post: ['READ', 'EDIT', 'DELETE'] },
 *   secret: 'a-256-bit-shared-secret-for-hs256!',
 *   issuer: 'api.example.com',
 *   _ondenied: (module, permission) => audit(module, permission),
 * });
 *
 * const token = await pact.generateJWT({ sub: 'user-1' });
 * const claims = await pact.verifyJWT(token);
 * pact.assert('Post', 'EDIT', { Post: 3n });
 * ```
 *
 * @module
 */

import { fetch as compatFetch } from '@tundralibs/compat/fetch';
import { isDeno } from '@tundralibs/compat/runtime';
import { hash, hkdf } from '@tundralibs/crypt';
import {
  decodeJWT as cryptDecodeJWT,
  issueJWT,
  type JWTAlgorithm,
  type JWTHeader,
  type JWTPayload,
  refreshJWT as cryptRefreshJWT,
  type RefreshKeyConfig,
  verifyJWT as cryptVerifyJWT,
} from '@tundralibs/crypt/JWT';
import { signHMAC, verifyHMAC } from '@tundralibs/crypt/sign';
import { nanoID } from '@tundralibs/id';
import { type EventOptionKeys, Options } from '@tundralibs/utils';
import { Groups } from './Groups.ts';
import { Permissions } from './Permissions.ts';
import { OAuthClient } from './oauth/OAuthClient.ts';
import { PactDefinitionError, PactTokenError } from './errors/mod.ts';
import type {
  AuthorizationUrlOptions,
  CallbackParams,
  OAuthProfile,
  PACTApiKey,
  PACTApiKeyOptions,
  PACTEvents,
  PACTGrants,
  PACTLoginOutcome,
  PACTLoginResult,
  PACTOptions,
  PACTPermissionBits,
  PACTPermissionRef,
  PACTPrincipal,
} from './types/mod.ts';

/**
 * The PACT authentication & authorization engine.
 *
 * @typeParam P - the permission registry type (name → bit).
 */
export class PACT<P extends PACTPermissionBits = PACTPermissionBits>
  extends Options<PACTOptions<P>, PACTEvents> {
  private readonly __permissions: Permissions<P>;
  private __groups?: Groups;
  private __syncTimer?: ReturnType<typeof setInterval>;
  private readonly __oauth = new Map<string, OAuthClient>();
  /**
   * Signing secret / RSA private key — held privately and kept OUT of the
   * `Options` store, so `getOption('secret')`/`getOptions()` can never
   * surface it (mirrors the Norm invariant).
   */
  private readonly __secretMaterial: PACTOptions<P>['secret'];
  /** Cached domain-separated HMAC key for {@link PACT.sign}/{@link PACT.verify}. */
  private __requestSignKey?: string;
  /**
   * Isolation wrappers, memoized by the consumer's original listener. Every
   * listener registered through {@link PACT.on}/{@link PACT.once} (including
   * the `_on<Event>` constructor options) is wrapped so that a rejection from
   * an **async** listener can never surface as an unhandled promise rejection
   * — the base `Events.emit` invokes listeners without awaiting their result,
   * so `__emitIsolated`'s synchronous `try/catch` alone cannot observe (and
   * therefore cannot swallow) a rejected promise. The map lets
   * {@link PACT.off} translate an original listener back to its wrapper. [F1]
   *
   * Keys are always functions: `on`/`once` drop a non-function listener
   * before it reaches the map (a `WeakMap` rejects a primitive key). [R1]
   */
  private readonly __isoListeners = new WeakMap<
    (...args: unknown[]) => unknown,
    (...args: unknown[]) => unknown
  >();

  /**
   * The `fetch` used for OAuth HTTP — compat's runtime-aware fetch by
   * default. A protected seam (RESTler-style) so tests can substitute a
   * stub without touching the global.
   */
  protected _fetch: typeof globalThis.fetch = compatFetch;

  /**
   * Build the engine from the permission registry plus whichever token, group
   * and OAuth wiring the deployment needs. `algorithm` defaults to `HS256` and
   * `expiry` to 3600 seconds; `secret` is held privately rather than in the
   * option store, so `getOptions()` can never surface it. Supplying
   * `groupResolver` enables the group cache, and a positive `syncInterval`
   * starts its refresh timer.
   *
   * @throws {@link PactDefinitionError} when `bits` is missing
   *   (`MISSING_OPTION`), the registry is malformed (via {@link Permissions}),
   *   the `secret` shape/length contradicts the algorithm (`INVALID_OPTION`),
   *   or an `oauth` entry is misconfigured (via {@link OAuthClient}).
   */
  constructor(options: EventOptionKeys<PACTOptions<P>, PACTEvents>) {
    super();
    // Keep the signing secret / RSA private key out of the public option
    // store; hold it privately so getOptions() can never leak it. [M2]
    const { secret, ...rest } = options;
    this.__secretMaterial = secret as PACTOptions<P>['secret'];
    this._setOptions(rest as EventOptionKeys<PACTOptions<P>, PACTEvents>, {
      algorithm: 'HS256',
      expiry: 3600,
    } as Partial<PACTOptions<P>>);
    const bits = this._getOption('bits');
    if (bits === undefined) {
      throw new PactDefinitionError(
        'PACT requires a `bits` permission registry',
        { code: 'MISSING_OPTION', option: 'bits' },
      );
    }
    this.__permissions = new Permissions<P>(bits, this._getOption('modules'));

    // Validate key material against the algorithm family: HS* takes one
    // shared secret string; RS* takes a PEM { privateKey, publicKey } pair.
    // RFC 7518 §3.2 binds the HMAC key floor to the hash output — HS256 ≥ 32 B,
    // HS384 ≥ 48 B, HS512 ≥ 64 B.
    const s = this.__secretMaterial;
    if (s !== undefined) {
      if (this.__isHMAC()) {
        if (typeof s !== 'string') {
          throw new PactDefinitionError(
            `Algorithm '${this.__algorithm()}' takes a shared secret string, not a key pair`,
            { code: 'INVALID_OPTION', option: 'secret' },
          );
        }
        // Per-algorithm minimum = hash output size in bytes (RFC 7518 §3.2):
        // HS256→32, HS384→48, HS512→64. Measure UTF-8 bytes, not string
        // length, so multi-byte characters are counted correctly.
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

    // Group resolution (consumer-owned data; PACT caches + syncs).
    const resolver = this._getOption('groupResolver');
    if (resolver !== undefined) {
      this.__groups = new Groups(resolver);
      const interval = this._getOption('syncInterval') ?? 0;
      if (interval > 0) this.__startSync(interval);
    }

    // OAuth provider instances (each doubles as a login strategy).
    const oauth = this._getOption('oauth');
    if (oauth !== undefined) {
      for (const [name, config] of Object.entries(oauth)) {
        this.__oauth.set(
          name,
          new OAuthClient(
            name,
            config,
            () => this._fetch,
            // Surface a silent id_token downgrade as an auditable event. The
            // login already succeeded on the claim-validated path, so a
            // throwing listener must not turn it into a failure. [F1]
            (reason) => this.__emitIsolated('idTokenUnverified', name, reason),
          ),
        );
      }
    }
  }

  // ── event subscription (isolation-wrapped) ───────────────────────────

  /**
   * Register a listener for `event`. Identical to the base emitter, except:
   *
   * - every listener is wrapped so a rejection from an **async** listener is
   *   swallowed instead of escaping as an unhandled promise rejection (which
   *   would crash the process). Sync throws still propagate to the emit site,
   *   where the isolated emits catch them. The wrapper returns the listener's
   *   own result, so the inherited `emitSync` still awaits async listeners in
   *   order and still surfaces their rejections to whoever awaited it. [F1]
   * - a non-function listener is ignored rather than registered. `_on<Event>`
   *   constructor options are typed as optional, so an unset optional hook
   *   (`_onverify: cfg.auditVerify`) arrives here as `undefined`; registering
   *   it would poison the event (the base `emit` aborts on the first
   *   non-callable entry, skipping every later listener). [R1]
   */
  override on<K extends keyof PACTEvents>(
    event: K,
    callback: PACTEvents[K],
  ): this;
  /**
   * Register several listeners for `event` — equivalent to calling
   * {@link PACT.on} once per entry, with the same isolation and non-function
   * handling.
   */
  override on<K extends keyof PACTEvents>(
    event: K,
    callback: PACTEvents[K][],
  ): this;
  override on<K extends keyof PACTEvents>(
    event: K,
    callback: PACTEvents[K] | PACTEvents[K][],
  ): this {
    if (Array.isArray(callback)) {
      for (const cb of callback) this.on(event, cb);
      return this;
    }
    if (typeof callback !== 'function') return this; // [R1]
    super.on(event, this.__isolate(callback) as unknown as PACTEvents[K]);
    return this;
  }

  /**
   * Register a listener that fires at most once. Same isolation and
   * non-function handling as {@link PACT.on} — the guard has to sit here too,
   * because the base `once` wraps the listener in its own (always callable)
   * one-shot closure before handing it to `on`. [F1] [R1]
   */
  override once<K extends keyof PACTEvents>(
    event: K,
    callback: PACTEvents[K],
  ): this;
  /**
   * Register several one-shot listeners for `event`. Each fires and removes
   * itself independently of the others.
   */
  override once<K extends keyof PACTEvents>(
    event: K,
    callback: PACTEvents[K][],
  ): this;
  override once<K extends keyof PACTEvents>(
    event: K,
    callback: PACTEvents[K] | PACTEvents[K][],
  ): this {
    if (Array.isArray(callback)) {
      for (const cb of callback) this.once(event, cb);
      return this;
    }
    if (typeof callback !== 'function') return this; // [R1]
    // The one-shot closure the base builds is registered through this class's
    // `on`, so it is isolation-wrapped, and its self-removal goes through
    // this class's `off`, which resolves it back to that wrapper.
    super.once(event, callback as PACTEvents[K]);
    return this;
  }

  /**
   * Remove a listener (or every listener for `event` when `callback` is
   * omitted). Translates the consumer's original listener back to the
   * isolation wrapper that was actually registered. [F1]
   */
  override off<K extends keyof PACTEvents>(
    event: K,
    callback?: PACTEvents[K],
  ): this;
  /**
   * Remove several listeners for `event`, or every listener for it when
   * `callback` is omitted. Entries that were never registered are ignored.
   */
  override off<K extends keyof PACTEvents>(
    event: K,
    callback?: PACTEvents[K][],
  ): this;
  override off<K extends keyof PACTEvents>(
    event: K,
    callback?: PACTEvents[K] | PACTEvents[K][],
  ): this {
    if (callback === undefined) {
      super.off(event);
      return this;
    }
    if (Array.isArray(callback)) {
      for (const cb of callback) this.off(event, cb);
      return this;
    }
    const cb = callback as unknown as (...args: unknown[]) => unknown;
    const wrapper = this.__isoListeners.get(cb);
    super.off(event, (wrapper ?? cb) as unknown as PACTEvents[K]);
    return this;
  }

  /** The underlying bitmask engine (permission registry + module catalog). */
  get permissions(): Permissions<P> {
    return this.__permissions;
  }

  // ── authorization ────────────────────────────────────────────────────

  /**
   * True when `grants` include `permission` on `module`.
   *
   * @throws {@link PactDefinitionError} on the catalog-validation conditions
   *   documented on {@link Permissions.has} (unknown module / permission).
   */
  hasPermission(
    module: string,
    permission: PACTPermissionRef<P>,
    grants: PACTGrants,
  ): boolean {
    return this.__permissions.has(module, permission, grants);
  }

  /**
   * Alias of {@link PACT.hasPermission}.
   *
   * @throws {@link PactDefinitionError} on the catalog-validation conditions
   *   documented on {@link Permissions.has} (unknown module / permission).
   */
  can(
    module: string,
    permission: PACTPermissionRef<P>,
    grants: PACTGrants,
  ): boolean {
    return this.__permissions.has(module, permission, grants);
  }

  /**
   * True when `grants` include *any* of `permissions` on `module`.
   *
   * @throws {@link PactDefinitionError} on the catalog-validation conditions
   *   documented on {@link Permissions.has} (unknown module / permission).
   */
  canAny(
    module: string,
    permissions: ReadonlyArray<PACTPermissionRef<P>>,
    grants: PACTGrants,
  ): boolean {
    return this.__permissions.any(module, permissions, grants);
  }

  /**
   * True when `grants` include *all* of `permissions` on `module`.
   *
   * @throws {@link PactDefinitionError} on the catalog-validation conditions
   *   documented on {@link Permissions.has} (unknown module / permission).
   */
  canAll(
    module: string,
    permissions: ReadonlyArray<PACTPermissionRef<P>>,
    grants: PACTGrants,
  ): boolean {
    return this.__permissions.all(module, permissions, grants);
  }

  /**
   * Enforce `permission` on `module`: emits `granted` on success or `denied`
   * on failure (for audit), then throws when denied.
   *
   * @throws {@link PactDeniedError} when `grants` lack `permission`.
   * @throws {@link PactDefinitionError} on the catalog-validation conditions
   *   documented on {@link Permissions.has} (unknown module / permission).
   */
  assert(
    module: string,
    permission: PACTPermissionRef<P>,
    grants: PACTGrants,
  ): void {
    if (this.__permissions.has(module, permission, grants)) {
      // The authorization decision is final; isolate the audit emit so a
      // throwing `granted` listener can't turn an authorized check into a
      // thrown non-{@link PactDeniedError}. [F1]
      this.__emitIsolated('granted', module, permission, grants);
      return;
    }
    // Likewise isolate `denied`, so the caller sees the PactDeniedError below
    // rather than a throwing audit listener's error. [F1]
    this.__emitIsolated('denied', module, permission, grants);
    this.__permissions.assert(module, permission, grants); // throws
  }

  // ── mask math ─────────────────────────────────────────────────────────

  /**
   * Return a new mask with `permissions` added (bitwise OR).
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_PERMISSION`) when a named
   *   permission is absent from the registry (via {@link Permissions.resolve}).
   */
  grant(mask: bigint, ...permissions: PACTPermissionRef<P>[]): bigint {
    return this.__permissions.grant(mask, ...permissions);
  }

  /**
   * Return a new mask with `permissions` removed (bitwise AND-NOT).
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_PERMISSION`) when a named
   *   permission is absent from the registry (via {@link Permissions.resolve}).
   */
  revoke(mask: bigint, ...permissions: PACTPermissionRef<P>[]): bigint {
    return this.__permissions.revoke(mask, ...permissions);
  }

  /** Bits added (in `b`, not `a`) and removed (in `a`, not `b`). */
  diff(a: bigint, b: bigint): { added: bigint; removed: bigint } {
    return this.__permissions.diff(a, b);
  }

  /**
   * Decompose a `module` mask into the applicable permission names it holds.
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_MODULE`) when a module
   *   catalog is configured and `module` is not declared in it.
   */
  toNames(module: string, mask: bigint): Array<keyof P & string> {
    return this.__permissions.toNames(module, mask);
  }

  /**
   * Combine permission `names` into a `module` mask (validated).
   *
   * @throws {@link PactDefinitionError} on the catalog-validation conditions
   *   documented on {@link Permissions.has} (unknown module / permission).
   */
  toMask(module: string, names: ReadonlyArray<keyof P & string>): bigint {
    return this.__permissions.toMask(module, names);
  }

  // ── groups (consumer-owned; PACT resolves + caches) ───────────────────

  /**
   * Re-fetch group grants through the `groupResolver` (default: every
   * cached group). Emits `sync` when anything was refreshed. The
   * `syncInterval` timer calls this automatically.
   *
   * @throws {@link PactDefinitionError} (`MISSING_OPTION`) when no
   *   `groupResolver` is configured (shared by all `*Groups` methods).
   */
  async syncGroups(groupIds?: string[]): Promise<string[]> {
    const ids = await this.__requireGroups().sync(groupIds);
    if (ids.length > 0) this._emit('sync', ids);
    return ids;
  }

  /**
   * Combined grants for a principal: the OR of every listed group's grants
   * (resolved lazily and cached) plus optional `direct` per-principal
   * grants. Pair with `serializeGrants` to embed the result in a JWT.
   *
   * @throws {@link PactDefinitionError} (`MISSING_OPTION`) when no
   *   `groupResolver` is configured.
   */
  grantsForGroups(
    groupIds: string[],
    direct?: PACTGrants,
  ): Promise<PACTGrants> {
    return this.__requireGroups().combined(groupIds, direct);
  }

  /**
   * Group-aware permission check — pass **all** the principal's group ids;
   * any group that grants the permission grants it (OR semantics), and
   * `direct` grants participate the same way.
   *
   * @throws {@link PactDefinitionError} (`MISSING_OPTION`) when no
   *   `groupResolver` is configured, or on the catalog-validation conditions
   *   documented on {@link Permissions.has} (unknown module / permission).
   */
  async hasPermissionForGroups(
    module: string,
    permission: PACTPermissionRef<P>,
    groupIds: string[],
    direct?: PACTGrants,
  ): Promise<boolean> {
    const grants = await this.grantsForGroups(groupIds, direct);
    return this.__permissions.has(module, permission, grants);
  }

  /** Stop the periodic group re-sync timer (safe to call repeatedly). */
  stopSync(): void {
    if (this.__syncTimer !== undefined) {
      clearInterval(this.__syncTimer);
      this.__syncTimer = undefined;
    }
  }

  // ── tokens (JWT via @tundralibs/crypt) ────────────────────────────────

  /**
   * Issue a JWT. Stamps `iat` (now), `exp` (now + `expiry`), `iss` and
   * `aud` (from options) — caller `claims` win on conflict. Emits `issue`.
   *
   * @param claims - payload claims (`sub`, custom claims, …)
   * @returns the signed compact JWT
   * @throws {@link PactDefinitionError} (`MISSING_OPTION`) when no `secret`
   *   is configured.
   */
  async generateJWT(claims: JWTPayload): Promise<string> {
    const key = this.__signKey();
    const now = Math.floor(Date.now() / 1000);
    const expiry = this._getOption('expiry') ?? 3600;
    const issuer = this._getOption('issuer');
    const audience = this._getOption('audience');
    const payload: JWTPayload = {
      iat: now,
      exp: now + expiry,
      ...(issuer !== undefined ? { iss: issuer } : {}),
      ...(audience !== undefined ? { aud: audience } : {}),
      ...claims,
    };
    const token = await issueJWT(
      this.__algorithm(),
      payload,
      key,
      this._getOption('keyId'),
    );
    this._emit('issue', token, payload);
    return token;
  }

  /**
   * Verify a JWT: signature + standard claims (algorithm pinned to the
   * configured one; `iss`/`aud` enforced when set), then the `isRevoked`
   * seam. Emits `verify` on success — after the outcome is final, with
   * listener exceptions isolated, so a throwing `verify` listener can
   * neither reject a valid token nor fire `verifyFailed`. Emits
   * `verifyFailed` (and `revoked` when applicable) on failure — that emit is
   * isolated too (sync throw or async rejection), so a misbehaving listener
   * cannot replace the typed error below nor escape as an unhandled rejection.
   *
   * @param token - compact JWT to verify
   * @returns the verified payload
   * @throws crypt `JWTError` (signature/claims) or {@link PactTokenError}
   *   with code `TOKEN_REVOKED`
   */
  async verifyJWT<T extends JWTPayload = JWTPayload>(
    token: string,
  ): Promise<T> {
    const key = this.__verifyKey();
    const issuer = this._getOption('issuer');
    const audience = this._getOption('audience');
    let claims: T;
    try {
      claims = await cryptVerifyJWT<T>(token, key, {
        algorithm: this.__algorithm(),
        ...(issuer !== undefined ? { iss: issuer } : {}),
        ...(audience !== undefined ? { aud: audience } : {}),
      });
      const isRevoked = this._getOption('isRevoked');
      if (isRevoked !== undefined && await isRevoked(claims)) {
        // The revocation decision is final. Isolate the audit emit so a
        // throwing `revoked` listener can't replace the PactTokenError the
        // caller must branch on (code TOKEN_REVOKED) — otherwise its error
        // would be caught below and re-thrown in place of ours. [F1]
        this.__emitIsolated('revoked', claims, token);
        throw new PactTokenError('Token has been revoked', {
          code: 'TOKEN_REVOKED',
        });
      }
    } catch (error) {
      // Isolate the failure emit as well: a throwing (or rejecting)
      // `verifyFailed` listener must not replace the typed error the caller
      // branches on — the crypt `JWTError`, or the `TOKEN_REVOKED`
      // PactTokenError raised just above. [F1]
      this.__emitIsolated('verifyFailed', error as Error, token);
      throw error;
    }
    // The token is cryptographically valid and not revoked — the outcome is
    // final. Emit the success event OUTSIDE the guarded region with listener
    // errors isolated, so a throwing audit listener can neither flip a valid
    // token into a rejection nor route it through `verifyFailed`. [F1]
    this.__emitIsolated('verify', claims, token);
    return claims;
  }

  /**
   * Refresh a JWT: verifies it first (including the revocation seam — a
   * revoked token cannot be refreshed), then re-issues with a fresh
   * `exp = now + expiry`. A successful refresh fires **two** events: the
   * inner verification emits `verify`, then the re-issue emits `refresh`
   * (never `issue`). Both are success events, so listener exceptions are
   * isolated — a throwing audit listener cannot reject the refresh.
   *
   * @param token - compact JWT to refresh
   * @returns the newly issued JWT
   */
  async refreshJWT(token: string): Promise<string> {
    const claims = await this.verifyJWT(token);
    const fresh = await cryptRefreshJWT(
      token,
      this.__refreshKeys(),
      this._getOption('expiry') ?? 3600,
      this._getOption('keyId'),
    );
    // The fresh token is already minted — isolate listener errors like the
    // other success emits. [F1]
    this.__emitIsolated('refresh', fresh, token, claims);
    return fresh;
  }

  /**
   * Decode a JWT **without verifying** — header + payload for inspection
   * (routing, kid lookup, debugging). Never trust decoded claims for
   * authorization; use {@link PACT.verifyJWT}.
   */
  decodeJWT(token: string): { header: JWTHeader; payload: JWTPayload } {
    return cryptDecodeJWT(token);
  }

  // ── request signing (HMAC via @tundralibs/crypt) ─────────────────────

  /**
   * HMAC-sign arbitrary content (bearer-token schemes, webhook payloads,
   * signed URLs). When `key` is omitted, PACT uses a key **derived** from
   * the configured secret with a distinct domain label — *not* the raw JWT
   * signing secret — so a request signature can never be replayed as a JWT
   * signature (see {@link PACT.verify}). Pass an explicit `key` to sign with
   * your own key instead (required when PACT holds an RSA key pair).
   *
   * @param content - content to sign
   * @param key - optional explicit HMAC key
   * @throws {@link PactDefinitionError} (`MISSING_OPTION`) when no `key` is
   *   given and PACT has no shared `secret` (or holds an RSA key pair).
   */
  async sign(content: string | Uint8Array, key?: string): Promise<string> {
    return signHMAC(content, key ?? await this.__signingKey());
  }

  /**
   * Verify an HMAC signature produced by {@link PACT.sign} (same key
   * derivation; pass the same explicit `key` if you signed with one).
   *
   * @param content - the signed content
   * @param signature - the signature to check
   * @param key - optional explicit HMAC key (see {@link PACT.sign})
   */
  async verify(
    content: string | Uint8Array,
    signature: string,
    key?: string,
  ): Promise<boolean> {
    return verifyHMAC(content, signature, key ?? await this.__signingKey());
  }

  // ── API keys (self-contained minting; consumer stores id + hash) ──────

  /**
   * Mint an API key pair: a public `id` (`<prefix>_ak_…`), a `secret`
   * (`<prefix>_sk_…`, ~168-bit entropy at the 32-char default — show it once,
   * never store it), and `secretHash` (SHA-256 hex) for the consumer to persist
   * next to the id. Check presented secrets with {@link PACT.verifyAPIKey};
   * sign request payloads with the secret via {@link PACT.sign}.
   */
  async generateAPIKey(options?: PACTApiKeyOptions): Promise<PACTApiKey> {
    const prefix = options?.prefix ?? 'pact';
    const id = `${prefix}_ak_${nanoID(options?.idLength ?? 16)}`;
    const secret = `${prefix}_sk_${nanoID(options?.secretLength ?? 32)}`;
    return { id, secret, secretHash: await hash(secret) };
  }

  /**
   * Check a presented API secret against the stored `secretHash`
   * (constant-time comparison of the digests).
   */
  async verifyAPIKey(secret: string, secretHash: string): Promise<boolean> {
    const computed = await hash(secret);
    if (computed.length !== secretHash.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ secretHash.charCodeAt(i);
    }
    return diff === 0;
  }

  // ── login (strategy seam; OAuth instances are built-in strategies) ────

  /**
   * Run a login: `name` is either a `strategies` entry (credentials are
   * whatever that strategy expects) or an `oauth` instance (credentials
   * are the {@link CallbackParams} from the provider redirect). Returns
   * `null` for bad credentials (emits `loginFailed`); returns the
   * principal (+ `token` when `autoIssue` is on, `sub = principal.id`) on
   * success (emits `login` after the outcome is final, with listener
   * exceptions isolated — a throwing `login` listener can neither fail a
   * successful login nor fire `loginFailed`). Operational failures rethrow
   * after emitting `loginFailed`. The `loginFailed` emit is isolated too
   * (sync throw or async rejection), so it fires exactly once per attempt and
   * a misbehaving listener cannot convert a bad-credentials `null` into a
   * throw or replace the operational error.
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_STRATEGY`) when no strategy
   *   or OAuth instance is named `name`; also rethrows whatever the strategy
   *   / OAuth callback throws (e.g. {@link PactOAuthError}), and any
   *   `autoIssue` token-issue failure.
   */
  async login(
    name: string,
    credentials: unknown,
  ): Promise<PACTLoginResult | null> {
    const strategy = this._getOption('strategies')?.[name];
    const oauth = this.__oauth.get(name);
    if (strategy === undefined && oauth === undefined) {
      throw new PactDefinitionError(
        `No login strategy or OAuth instance named '${name}'`,
        { code: 'UNKNOWN_STRATEGY', strategy: name },
      );
    }
    let result: PACTLoginResult;
    try {
      let outcome: PACTLoginOutcome;
      if (strategy !== undefined) {
        outcome = await strategy(credentials);
      } else {
        const profile = await oauth!.callback(credentials as CallbackParams);
        const map = this._getOption('oauth')![name]!.map;
        outcome = map !== undefined
          ? await map(profile)
          : { id: `${name}:${profile.id}`, profile };
      }
      if (outcome === null) {
        this.__emitIsolated('loginFailed', name);
        return null;
      }
      // Discriminate the outcome: a top-level string `id` is the principal
      // itself; otherwise it's the `{ principal, isNew? }` wrapper.
      let principal: PACTPrincipal;
      let isNew = false;
      if (typeof (outcome as { id?: unknown }).id === 'string') {
        principal = outcome as PACTPrincipal;
      } else if (typeof outcome === 'object' && 'principal' in outcome) {
        principal = (outcome as { principal: PACTPrincipal }).principal;
        isNew = (outcome as { isNew?: boolean }).isNew ?? false;
      } else {
        this.__emitIsolated('loginFailed', name);
        return null;
      }
      // A resolved principal MUST carry a string `id` (JWT `sub`); a
      // contract-violating strategy return fails closed. [L6]
      if (
        principal === null || typeof principal !== 'object' ||
        typeof (principal as { id?: unknown }).id !== 'string'
      ) {
        this.__emitIsolated('loginFailed', name);
        return null;
      }
      result = { principal, isNew };
      // Inside the try so an autoIssue failure routes through loginFailed. [L6]
      if (this._getOption('autoIssue') === true) {
        result.token = await this.generateJWT({ sub: principal.id });
      }
    } catch (error) {
      // Isolate this failure emit too. It also fixes a double-fire: the
      // bad-credentials emits above sit inside this `try`, so an unisolated
      // throwing `loginFailed` listener would be caught here and re-emit
      // `loginFailed` a second time before rethrowing the listener's error in
      // place of the real one. Isolation keeps it to a single emit and
      // preserves the operational error. [F1]
      this.__emitIsolated('loginFailed', name, error as Error);
      throw error;
    }
    // The login (and any autoIssue mint) succeeded — emit OUTSIDE the guarded
    // region with listener errors isolated, so a throwing audit listener can
    // neither fail the login nor route it through `loginFailed`. [F1]
    this.__emitIsolated('login', name, result.principal, result.isNew);
    return result;
  }

  // ── OAuth (in-house auth-code + PKCE client) ──────────────────────────

  /**
   * Start an OAuth flow: returns the redirect `url` plus the `state` and
   * PKCE `verifier` you must hold (session/cookie) until the callback.
   */
  getAuthorizationUrl(
    provider: string,
    options?: AuthorizationUrlOptions,
  ): Promise<{ url: string; state: string; verifier: string }> {
    return this.__requireOAuth(provider).authorizationUrl(options);
  }

  /**
   * Finish an OAuth flow: state check (when both sides provided), code →
   * token exchange (PKCE), and profile normalization. Use directly when
   * you want the raw {@link OAuthProfile}; use `login(provider, params)`
   * to run it through the login pipeline (mapping, events, `autoIssue`).
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_STRATEGY`) for an unknown
   *   `provider`.
   * @throws {@link PactOAuthError} on state mismatch (`OAUTH_STATE_MISMATCH`),
   *   a failed code exchange (`OAUTH_EXCHANGE_FAILED`), or a failed profile
   *   fetch / a profile with no subject (`id`) claim (`OAUTH_PROFILE_FAILED`).
   */
  handleCallback(
    provider: string,
    params: CallbackParams,
  ): Promise<OAuthProfile> {
    return this.__requireOAuth(provider).callback(params);
  }

  // ── internals ─────────────────────────────────────────────────────────

  /**
   * Emit an audit event with listener errors isolated. Once an operation's
   * outcome is final — a verified/issued token, a completed login, a settled
   * revocation, an authorization decision, or a reported failure whose typed
   * error the caller must branch on — a throwing (or rejecting) audit listener
   * must neither alter that outcome nor reroute it through a different event;
   * the listener's exception is swallowed.
   *
   * Two layers cooperate: a **synchronous** throw is caught here, while an
   * **async** listener's rejection is swallowed by the per-listener isolation
   * wrapper installed at registration ({@link PACT.on}) — the base
   * `Events.emit` does not await listener results, so this `try/catch` alone
   * cannot see a rejected promise. Used for the `verify`/`login`/`refresh`
   * success emits, the `revoked` rejection emit, the `granted`/`denied`
   * authorization emits, and the `verifyFailed`/`loginFailed` failure emits
   * (whose thrown error must not replace the typed one below). [F1]
   */
  private __emitIsolated<K extends keyof PACTEvents>(
    event: K,
    ...args: Parameters<PACTEvents[K]>
  ): void {
    try {
      this._emit(event, ...args);
    } catch {
      // Listener exceptions are isolated by contract — the operation's
      // outcome is already final and must be reported as such.
    }
  }

  /**
   * Return the memoized isolation wrapper for `callback`, creating it on
   * first use. The wrapper runs the listener via {@link PACT.__runIsolated},
   * which neutralizes an async rejection. Memoization keeps `on`/`off`
   * symmetric and preserves the base emitter's duplicate-registration
   * de-duplication (same callback → same wrapper). [F1]
   */
  private __isolate(
    callback: PACTEvents[keyof PACTEvents],
  ): (...args: unknown[]) => unknown {
    const cb = callback as unknown as (...args: unknown[]) => unknown;
    let wrapper = this.__isoListeners.get(cb);
    if (wrapper === undefined) {
      wrapper = (...args: unknown[]): unknown => this.__runIsolated(cb, args);
      this.__isoListeners.set(cb, wrapper);
    }
    return wrapper;
  }

  /**
   * Invoke a listener, attaching a rejection handler to the promise it
   * returns so an async listener's rejection can never escape as an unhandled
   * rejection. A **synchronous** throw is intentionally left to propagate to
   * the emit site, so {@link PACT.__emitIsolated}'s `try/catch` decides
   * whether it is isolated (audit emits) or surfaced (e.g. an `issue`/`sync`
   * listener, whose sync-throw behavior is unchanged). [F1]
   *
   * The listener's own result is returned unchanged. Attaching the handler
   * already marks the promise as handled, so nothing escapes from the
   * non-awaiting `emit`, while the inherited `emitSync` keeps its documented
   * contract: it awaits each listener in turn and rejects with whatever the
   * listener rejected with. Returning `undefined` here would silently disable
   * both that sequencing and that rejection. [R3]
   */
  private __runIsolated(
    cb: (...args: unknown[]) => unknown,
    args: unknown[],
  ): unknown {
    const result = cb(...args);
    if (
      result !== null && typeof result === 'object' &&
      typeof (result as PromiseLike<unknown>).then === 'function'
    ) {
      Promise.resolve(result as PromiseLike<unknown>).then(undefined, () => {});
    }
    return result;
  }

  /** The named OAuth client, or throw `UNKNOWN_STRATEGY`. */
  private __requireOAuth(name: string): OAuthClient {
    const client = this.__oauth.get(name);
    if (client === undefined) {
      throw new PactDefinitionError(
        `No OAuth instance named '${name}'`,
        { code: 'UNKNOWN_STRATEGY', strategy: name },
      );
    }
    return client;
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
  private __secret(): NonNullable<PACTOptions<P>['secret']> {
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

  /** Verification key: the shared secret (HS*) or the PEM public key (RS*). */
  private __verifyKey(): string {
    const secret = this.__secret();
    return typeof secret === 'string' ? secret : secret.publicKey;
  }

  /** Key material in crypt's refresh shape. */
  private __refreshKeys(): string | RefreshKeyConfig {
    const secret = this.__secret();
    return typeof secret === 'string'
      ? secret
      : { verifyKey: secret.publicKey, signKey: secret.privateKey };
  }

  /** The groups cache, or throw `MISSING_OPTION` when no resolver is set. */
  private __requireGroups(): Groups {
    if (this.__groups === undefined) {
      throw new PactDefinitionError(
        'Group operations require the `groupResolver` option',
        { code: 'MISSING_OPTION', option: 'groupResolver' },
      );
    }
    return this.__groups;
  }

  /** Start the unref'd periodic group re-sync timer. */
  private __startSync(interval: number): void {
    const timer = setInterval(() => {
      this.syncGroups().catch((error) => {
        // Isolate a throwing consumer handler so it can't surface as an
        // unhandled rejection from the detached timer. [L4]
        try {
          this._emit('syncFailed', error as Error);
        } catch { /* swallow listener errors on the detached timer path */ }
      });
    }, interval);
    // Never hold the process open: Node/Bun timer handles expose unref();
    // Deno's handle is a plain number, so use Deno.unrefTimer instead.
    (timer as unknown as { unref?: () => void }).unref?.();
    if (isDeno) {
      (globalThis as { Deno?: { unrefTimer?: (id: number) => void } })
        .Deno?.unrefTimer?.(timer as unknown as number);
    }
    this.__syncTimer = timer;
  }

  /** Shared secret for HMAC sign/verify — RSA pairs have none. */
  private __hmacSecret(): string {
    const secret = this.__secret();
    if (typeof secret !== 'string') {
      throw new PactDefinitionError(
        'HMAC sign/verify needs a shared secret string — an RSA key pair is configured; pass a key explicitly',
        { code: 'MISSING_OPTION', option: 'secret' },
      );
    }
    return secret;
  }

  /**
   * Domain-separated HMAC key for {@link PACT.sign}/{@link PACT.verify},
   * derived once from the shared secret via **HKDF** (RFC 5869) under a
   * distinct `info` label. Because it is `HKDF(secret, info:'pact:request-sign')`
   * — never the raw secret — an attacker who controls signed content cannot
   * produce a valid HS\* JWT signature (which is HMAC over
   * `base64url(header).base64url(payload)` under the raw secret). [H1]
   */
  private async __signingKey(): Promise<string> {
    if (this.__requestSignKey === undefined) {
      const derived = await hkdf(this.__hmacSecret(), {
        info: 'pact:request-sign',
      });
      this.__requestSignKey = toHex(derived);
    }
    return this.__requestSignKey;
  }
}

/** Hex-encode bytes — HKDF output → a string key for crypt's `signHMAC`. */
const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

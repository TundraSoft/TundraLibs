/**
 * @fileoverview OAuth2 / OIDC client — authorization-code + PKCE, built on
 * `@tundralibs/restler` (timeouts, credential-redacted errors, and the
 * `witness` tracing seam come from the base).
 *
 * Transport-neutral by design: the client performs no redirects, sets no
 * cookies, and holds no state — the consumer redirects to the returned
 * `url` and holds `state`/`verifier`/`nonce` until the callback.
 *
 * Flow:
 * 1. {@link OAuthClient.authorizationUrl} → `{ url, state, verifier, nonce }`
 * 2. consumer redirects, provider calls back with `code` (+ `state`)
 * 3. {@link OAuthClient.callback} → exchange code (PKCE) → fetch profile,
 *    or verify the `id_token` when the provider has no userinfo endpoint
 *    ({@link IdTokenVerifier}) → normalized profile with declared claims
 *    extracted and sanitized.
 *
 * @module
 */

import { nanoID } from '@tundralibs/id';
import { RESTler } from '@tundralibs/restler';
import { PactDefinitionError, PactOAuthError } from '../errors/mod.ts';
import { IdTokenVerifier } from './IdTokenVerifier.ts';
import { type ProviderPreset, PROVIDERS } from './providers.ts';
import type {
  PactAuthorizationUrlOptions,
  PactClaimSpec,
  PactClaimValue,
  PactOAuthCallbackParams,
  PactOAuthProfile,
  PactOAuthProviderConfig,
  PactOAuthTokens,
} from '../types/mod.ts';

/** Resolved provider endpoints (preset constants or oidc discovery). */
type Endpoints = {
  authorization: string;
  token: string;
  userinfo?: string;
  jwks?: string;
};

/** RFC 4648 §5 base64url (unpadded) of raw bytes. */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(
    /=+$/,
    '',
  );
}

/** PKCE S256 challenge for a verifier. */
async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

/** Split an absolute URL into restler's `baseURL` + `path` (+ query). */
function splitUrl(
  url: string,
): { baseURL: string; path: string; query?: Record<string, string> } {
  const u = new URL(url);
  const query: Record<string, string> = {};
  u.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return {
    baseURL: u.origin,
    path: u.pathname,
    query: Object.keys(query).length > 0 ? query : undefined,
  };
}

/**
 * Resolve (and validate) the instance's anchor URL for the RESTler base —
 * the token endpoint's origin, or the `OIDC` issuer. Runs inside the
 * `super()` argument, so config errors throw before any base construction.
 *
 * @throws {@link PactDefinitionError} when `config.provider` is unknown
 *   (`UNKNOWN_PROVIDER`), or the `OIDC` preset is missing an issuer
 *   (`MISSING_OPTION`) / has a non-https issuer (`INVALID_OPTION`).
 */
function resolveAnchor(name: string, config: PactOAuthProviderConfig): string {
  const preset = PROVIDERS[config.provider];
  if (preset === undefined) {
    throw new PactDefinitionError(
      `OAuth instance '${name}' references unknown provider '${config.provider}'`,
      { code: 'UNKNOWN_PROVIDER', instance: name },
    );
  }
  if (config.provider === 'OIDC') {
    if (!config.issuer) {
      throw new PactDefinitionError(
        `OAuth instance '${name}' uses the OIDC preset and requires an issuer`,
        { code: 'MISSING_OPTION', instance: name, option: 'issuer' },
      );
    }
    // Discovery + the code/secret exchange run against this issuer, and it
    // is the trust anchor for the id_token's `iss`; refuse plaintext so
    // credentials, the discovered `jwks_uri`, and the id_token can't be
    // MITM'd. [L1]
    if (!config.issuer.startsWith('https://')) {
      throw new PactDefinitionError(
        `OAuth instance '${name}' issuer must be https (got '${config.issuer}')`,
        { code: 'INVALID_OPTION', instance: name, option: 'issuer' },
      );
    }
    return new URL(config.issuer).origin;
  }
  const tenant = config.tenant ?? 'common';
  return new URL(preset.token.replace('{tenant}', tenant)).origin;
}

/**
 * One configured OAuth provider instance. Composed by the `Pact` engine
 * (one per `oauth` option entry) but usable standalone.
 */
export class OAuthClient extends RESTler {
  /** RESTler vendor label — surfaces in request error/trace context. */
  public readonly vendor = 'pact-oauth';

  private readonly __name: string;
  private readonly __config: PactOAuthProviderConfig;
  private readonly __preset: ProviderPreset;
  /** JWKS-backed id_token verifier (owns its own key cache). */
  private readonly __idTokens: IdTokenVerifier;
  /** Discovered oidc endpoints (fetched once, then cached). */
  private __discovered?: Endpoints;

  /**
   * Create a client for one configured provider instance. Endpoints come
   * from the named preset; the `OIDC` preset instead resolves them by
   * discovery against `config.issuer`, which must be https because it is
   * also the trust anchor for the returned `id_token`. Nothing is fetched
   * here — discovery is deferred to first use.
   *
   * @param name - the configured instance name
   * @param config - the provider-instance configuration
   * @param onIdTokenUnverified - notified when id_token signature
   *   verification degraded to decode-only under the `'PREFERRED'`
   *   policy; the engine turns this into the `idTokenUnverified` event.
   * @throws {@link PactDefinitionError} when `config.provider` is unknown
   *   (`UNKNOWN_PROVIDER`), or the `OIDC` preset is missing an issuer
   *   (`MISSING_OPTION`) / has a non-https issuer (`INVALID_OPTION`).
   */
  constructor(
    name: string,
    config: PactOAuthProviderConfig,
    onIdTokenUnverified?: (reason: string) => void,
  ) {
    super({ baseURL: resolveAnchor(name, config) });
    this.__name = name;
    this.__config = config;
    this.__preset = PROVIDERS[config.provider];
    this.__idTokens = new IdTokenVerifier(name, () => this._fetch, {
      policy: config.idTokenVerification,
      ttl: config.jwksCacheTtl,
      onDegraded: onIdTokenUnverified,
    });
  }

  /** The configured instance name. */
  get name(): string {
    return this.__name;
  }

  /**
   * Build the authorization redirect URL plus the `state` (CSRF token),
   * PKCE `verifier`, and OIDC `nonce` the consumer must hold until the
   * callback. Declared `claims` are merged into the OIDC `claims` request
   * parameter on OIDC-speaking presets.
   *
   * @throws {@link PactOAuthError} (`OAUTH_EXCHANGE_FAILED`) for an `OIDC`
   *   preset when discovery fails or the discovery document declares a
   *   non-https authorization/token/userinfo endpoint.
   */
  async authorizationUrl(
    options?: PactAuthorizationUrlOptions,
  ): Promise<
    { url: string; state: string; verifier: string; nonce: string }
  > {
    const endpoints = await this.__endpoints();
    const state = options?.state ?? nanoID(32);
    const verifier = nanoID(64);
    const nonce = nanoID(32);
    const url = new URL(endpoints.authorization);
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: this.__config.clientId,
      redirect_uri: this.__config.redirectUri,
      scope: (options?.scopes ?? this.__config.scopes ?? this.__preset.scopes)
        .join(' '),
      state,
      code_challenge: await s256(verifier),
      code_challenge_method: 'S256',
      // OIDC-speaking providers get the replay-guard nonce and any
      // declared claims; others would just echo unknown params back.
      ...(this.__preset.oidc === true ? { nonce } : {}),
      ...this.__claimsParam(),
      ...this.__preset.authParams,
      ...this.__config.authParams,
      ...options?.params,
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return { url: url.toString(), state, verifier, nonce };
  }

  /**
   * Finish the flow: (fail-closed) `state` check, code + PKCE verifier →
   * token exchange, and profile resolution — userinfo fetch, or verified
   * `id_token` when the provider publishes no userinfo endpoint. Fails
   * closed when the normalized profile carries no subject (`id`) claim
   * rather than mint a fabricated `'undefined'` principal. Declared
   * claims are extracted from the raw payload, sanitized fail-soft.
   *
   * @throws {@link PactOAuthError} on state mismatch
   *   (`OAUTH_STATE_MISMATCH`), a failed exchange
   *   (`OAUTH_EXCHANGE_FAILED`), a failed profile fetch / id_token decode
   *   / a profile with no subject (`OAUTH_PROFILE_FAILED`), a rejected
   *   id_token (`OAUTH_IDTOKEN_INVALID`), or an unobtainable key set
   *   under the `'REQUIRED'` policy (`OAUTH_JWKS_UNAVAILABLE`).
   */
  async callback(params: PactOAuthCallbackParams): Promise<PactOAuthProfile> {
    // Fail closed: once the caller opts into CSRF protection by supplying
    // `expectedState`, a missing or mismatched callback `state` is
    // rejected — an attacker cannot bypass the check by dropping the
    // `state` param. [M3]
    if (
      params.expectedState !== undefined &&
      params.state !== params.expectedState
    ) {
      throw new PactOAuthError(
        `OAuth state mismatch for '${this.__name}'`,
        { code: 'OAUTH_STATE_MISMATCH', provider: this.__name },
      );
    }
    const tokens = await this.__exchange(params.code, params.verifier);
    const raw = this.__preset.identity === 'id_token'
      ? await this.__idTokenIdentity(tokens, params)
      : await this.__userinfo(tokens, params);
    const profile = this.__preset.profile(raw);
    // Fail closed on a subject-less profile. A nonconforming IdP (dropped
    // claims mapping, or a 200 error body) can return a payload with no
    // subject claim; minting a principal from a fabricated
    // '<provider>:undefined' id would silently merge distinct users into
    // one account. Conforming providers always send the subject.
    const id = profile.id;
    if (id === undefined) {
      throw new PactOAuthError(
        `OAuth profile for '${this.__name}' is missing a subject identifier`,
        { code: 'OAUTH_PROFILE_FAILED', provider: this.__name },
      );
    }
    const claims = this.__config.claims !== undefined
      ? extractClaims(raw, this.__config.claims)
      : undefined;
    return {
      provider: this.__name,
      ...profile,
      id,
      ...(claims !== undefined ? { claims } : {}),
      raw,
      tokens,
    };
  }

  // ── internals ─────────────────────────────────────────────────────

  /**
   * The OIDC `claims` request parameter built from the declared claim
   * specs — targeted at `userinfo` or `id_token` per the preset's
   * identity source. Empty for non-OIDC presets or no declaration.
   */
  private __claimsParam(): Record<string, string> {
    const declared = this.__config.claims;
    if (this.__preset.oidc !== true || declared === undefined) return {};
    const requested: Record<string, null> = {};
    for (const spec of Object.values(declared)) {
      const from = typeof spec === 'string' ? spec : spec.from;
      // Only top-level claim names are requestable; dot-paths address
      // nested payload data the provider returns on its own.
      if (!from.includes('.')) requested[from] = null;
    }
    if (Object.keys(requested).length === 0) return {};
    const target = this.__preset.identity === 'id_token'
      ? 'id_token'
      : 'userinfo';
    return { claims: JSON.stringify({ [target]: requested }) };
  }

  /**
   * Identity from the `id_token` — signature-checked against the
   * provider's JWKS and claim-validated. See {@link IdTokenVerifier} for
   * the failure policy when the key set cannot be reached.
   */
  private async __idTokenIdentity(
    tokens: PactOAuthTokens,
    params: PactOAuthCallbackParams,
  ): Promise<Record<string, unknown>> {
    const endpoints = await this.__endpoints();
    return await this.__idTokens.verify(tokens.idToken, {
      jwksUri: endpoints.jwks,
      // For OIDC the anchor is the *configured* (https-validated) issuer —
      // checking a token against an issuer the discovery document itself
      // supplied would be circular.
      issuer: this.__config.provider === 'OIDC'
        ? this.__config.issuer
        : this.__preset.issuer,
      audience: this.__config.clientId,
      nonce: params.expectedNonce,
    });
  }

  /** Preset endpoints, with `{tenant}` applied and oidc discovery cached. */
  private async __endpoints(): Promise<Endpoints> {
    if (this.__config.provider === 'OIDC') {
      if (this.__discovered === undefined) {
        const issuer = this.__config.issuer!.replace(/\/$/, '');
        const doc = await this.__getJson(
          `${issuer}/.well-known/openid-configuration`,
          'OIDC discovery',
        );
        this.__discovered = {
          authorization: this.__requireHttps(
            String(doc.authorization_endpoint),
            'authorization',
          ),
          token: this.__requireHttps(String(doc.token_endpoint), 'token'),
          userinfo: typeof doc.userinfo_endpoint === 'string'
            ? this.__requireHttps(doc.userinfo_endpoint, 'userinfo')
            : undefined,
          // `jwks_uri` is validated (https) again downstream by the
          // verifier.
          jwks: typeof doc.jwks_uri === 'string' ? doc.jwks_uri : undefined,
        };
      }
      return this.__discovered;
    }
    const tenant = this.__config.tenant ?? 'common';
    return {
      authorization: this.__preset.authorization.replace('{tenant}', tenant),
      token: this.__preset.token.replace('{tenant}', tenant),
      userinfo: this.__preset.userinfo,
      jwks: this.__preset.jwks?.replace('{tenant}', tenant),
    };
  }

  /**
   * Reject a discovered endpoint that isn't `https`. The discovery
   * document arrives over the https-validated issuer, but the endpoints
   * it *declares* are still attacker-influenceable data — and the token
   * endpoint carries the authorization `code` + `client_secret` while
   * userinfo carries the bearer access token, so a plaintext (or
   * downgraded) endpoint would exfiltrate them. [L1]
   *
   * @throws {@link PactOAuthError} (`OAUTH_EXCHANGE_FAILED`) when
   *   `endpoint` is not an `https://` URL.
   */
  private __requireHttps(endpoint: string, kind: string): string {
    if (!endpoint.startsWith('https://')) {
      throw new PactOAuthError(
        `OIDC discovery for '${this.__name}' returned a non-https ${kind} endpoint ('${endpoint}')`,
        { code: 'OAUTH_EXCHANGE_FAILED', provider: this.__name },
      );
    }
    return endpoint;
  }

  /** POST the token endpoint (form-encoded; JSON accepted for GitHub). */
  private async __exchange(
    code: string,
    verifier: string,
  ): Promise<PactOAuthTokens> {
    const endpoints = await this.__endpoints();
    const target = splitUrl(endpoints.token);
    const payload: Record<string, unknown> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.__config.redirectUri,
      client_id: this.__config.clientId,
      code_verifier: verifier,
      ...(this.__config.clientSecret !== undefined
        ? { client_secret: this.__config.clientSecret }
        : {}),
    };
    let status: number | null;
    let raw: Record<string, unknown>;
    try {
      const res = await this._makeRequest<Record<string, unknown>>({
        baseURL: target.baseURL,
        path: target.path,
        query: target.query,
        method: 'POST',
        contentType: 'FORM',
        payload,
        headers: { Accept: 'application/json' },
      });
      status = res.status;
      raw = typeof res.body === 'object' && res.body !== null
        ? res.body as Record<string, unknown>
        : {};
    } catch (cause) {
      throw new PactOAuthError(
        `OAuth code exchange failed for '${this.__name}'`,
        { code: 'OAUTH_EXCHANGE_FAILED', provider: this.__name },
        cause as Error,
      );
    }
    if (
      status === null || status < 200 || status >= 300 ||
      typeof raw.access_token !== 'string'
    ) {
      throw new PactOAuthError(
        `OAuth code exchange failed for '${this.__name}' (${status})`,
        {
          code: 'OAUTH_EXCHANGE_FAILED',
          provider: this.__name,
          status,
          error: raw.error,
        },
      );
    }
    return {
      accessToken: raw.access_token,
      refreshToken: typeof raw.refresh_token === 'string'
        ? raw.refresh_token
        : undefined,
      idToken: typeof raw.id_token === 'string' ? raw.id_token : undefined,
      expiresIn: typeof raw.expires_in === 'number'
        ? raw.expires_in
        : undefined,
      raw,
    };
  }

  /** GET the userinfo endpoint with the bearer token. */
  private async __userinfo(
    tokens: PactOAuthTokens,
    params: PactOAuthCallbackParams,
  ): Promise<Record<string, unknown>> {
    const endpoints = await this.__endpoints();
    if (endpoints.userinfo === undefined) {
      // No userinfo endpoint (e.g. an OIDC issuer that publishes none) —
      // identity falls back to the id_token, which is verified.
      return await this.__idTokenIdentity(tokens, params);
    }
    return await this.__getJson(
      endpoints.userinfo,
      'OAuth profile fetch',
      { Authorization: `Bearer ${tokens.accessToken}` },
      'OAUTH_PROFILE_FAILED',
    );
  }

  /**
   * GET an absolute URL expecting a JSON object body.
   *
   * @throws {@link PactOAuthError} with `code` on transport failure or a
   *   non-2xx / non-object response.
   */
  private async __getJson(
    url: string,
    what: string,
    headers?: Record<string, string>,
    code: 'OAUTH_EXCHANGE_FAILED' | 'OAUTH_PROFILE_FAILED' =
      'OAUTH_EXCHANGE_FAILED',
  ): Promise<Record<string, unknown>> {
    const target = splitUrl(url);
    let status: number | null;
    let body: unknown;
    try {
      const res = await this._makeRequest<Record<string, unknown>>({
        baseURL: target.baseURL,
        path: target.path,
        query: target.query,
        method: 'GET',
        headers: { Accept: 'application/json', ...headers },
      });
      status = res.status;
      body = res.body;
    } catch (cause) {
      throw new PactOAuthError(
        `${what} failed for '${this.__name}'`,
        { code, provider: this.__name },
        cause as Error,
      );
    }
    if (
      status === null || status < 200 || status >= 300 ||
      typeof body !== 'object' || body === null
    ) {
      throw new PactOAuthError(
        `${what} failed for '${this.__name}' (${status})`,
        { code, provider: this.__name, status },
      );
    }
    return body as Record<string, unknown>;
  }
}

// ── claims extraction (declarative, fail-soft) ──────────────────────

/** Resolve a dot-path against the raw payload. */
function getPath(raw: Record<string, unknown>, path: string): unknown {
  let value: unknown = raw;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Apply one CLOSED cast; `undefined` = uncastable (claim omitted). */
function castClaim(
  value: unknown,
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE',
): PactClaimValue | undefined {
  if (value === undefined || value === null) return undefined;
  switch (type) {
    case 'STRING': {
      if (typeof value === 'object') return undefined;
      const text = String(value).trim();
      return text.length > 0 ? text : undefined;
    }
    case 'NUMBER': {
      const n = typeof value === 'number' ? value : Number(String(value));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'BOOLEAN':
      if (value === true || value === 'true') return true;
      if (value === false || value === 'false') return false;
      return undefined;
    case 'DATE': {
      if (typeof value !== 'string' && typeof value !== 'number') {
        return undefined;
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
  }
}

/**
 * Extract the declared claims from the raw payload — missing or
 * uncastable claims are simply absent (fail-soft).
 */
function extractClaims(
  raw: Record<string, unknown>,
  specs: Record<string, PactClaimSpec>,
): Record<string, PactClaimValue> {
  const claims: Record<string, PactClaimValue> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const from = typeof spec === 'string' ? spec : spec.from;
    const type = typeof spec === 'string' ? 'STRING' : spec.type ?? 'STRING';
    const value = castClaim(getPath(raw, from), type);
    if (value !== undefined) claims[name] = value;
  }
  return claims;
}

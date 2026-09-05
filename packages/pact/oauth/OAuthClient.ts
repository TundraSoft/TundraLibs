/**
 * @fileoverview OAuth2 / OIDC client — authorization-code + PKCE, built
 * on `@tundralibs/restler` (timeouts, credential-redacted errors, and
 * the `witness` tracing seam come from the base).
 *
 * Transport-neutral by design: the client performs no redirects, sets no
 * cookies, and holds no per-flow state — the consumer redirects to the
 * returned `url` and holds `state`/`verifier`/`nonce` until the
 * callback.
 *
 * Flow:
 * 1. {@link OAuthClient.authorizationUrl} → `{ url, state, verifier,
 *    nonce }`
 * 2. consumer redirects; provider calls back with `code` (+ `state`)
 * 3. {@link OAuthClient.callback} → exchange code (PKCE) → fetch
 *    profile, or verify the `id_token` when the provider publishes no
 *    userinfo endpoint ({@link IdTokenVerifier}).
 *
 * @module
 */

import { Guardian } from '@tundralibs/guardian';
import { nanoID } from '@tundralibs/id';
import { RESTler } from '@tundralibs/restler';
import { PactError } from '../errors/mod.ts';
import { IdTokenVerifier } from './IdTokenVerifier.ts';
import { PROVIDERS } from './providers.ts';
import type {
  PactOAuthCallbackParams,
  PactOAuthProfile,
  PactOAuthProviderConfig,
  PactOAuthProviderPreset,
  PactOAuthTokens,
} from '../types/mod.ts';

/** OIDC discovery-document cache lifetime — one hour. */
const DISCOVERY_TTL_MS = 3_600_000;

/** Resolved provider endpoints (preset constants or oidc discovery). */
type Endpoints = {
  authorization: string;
  token: string;
  userinfo?: string;
  jwks?: string;
};

// ── boundary schemas — guardian at every external-JSON boundary ─────

/** The shape a consumer hands `options.oauth[<name>]`. */
const PROVIDER_CONFIG_SCHEMA = Guardian.object({
  kind: Guardian.string().notEmpty(),
  clientId: Guardian.string().notEmpty(),
  clientSecret: Guardian.string().notEmpty().optional(),
  redirectUri: Guardian.string().url(),
  scopes: Guardian.array(Guardian.string()).optional(),
  issuer: Guardian.string().url().optional(),
  tenant: Guardian.string().notEmpty().optional(),
  idToken: Guardian.string().optional(),
  autoProvision: Guardian.boolean().optional(),
  authParams: Guardian.object().optional(),
});

/** Token-endpoint response — extra provider fields pass through via
 * `raw`; only the fields pact consumes are validated. */
const TOKEN_RESPONSE_SCHEMA = Guardian.object({
  access_token: Guardian.string().notEmpty(),
  refresh_token: Guardian.string().optional(),
  id_token: Guardian.string().optional(),
  expires_in: Guardian.number().optional(),
});

/** OIDC discovery document — only the fields pact consumes. */
const DISCOVERY_SCHEMA = Guardian.object({
  authorization_endpoint: Guardian.string().url(),
  token_endpoint: Guardian.string().url(),
  userinfo_endpoint: Guardian.string().url().optional(),
  jwks_uri: Guardian.string().url().optional(),
});

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
 * Resolve (and validate) the instance's anchor URL for the RESTler base
 * — the token endpoint's origin, or the `OIDC` issuer. Runs inside the
 * `super()` argument, so config errors throw before any base
 * construction.
 *
 * @throws {PactError} `INVALID_OPTION` for an unknown provider kind, a
 *   missing `OIDC` issuer, or a non-https issuer.
 */
function resolveAnchor(name: string, config: PactOAuthProviderConfig): string {
  try {
    PROVIDER_CONFIG_SCHEMA.parse(config);
  } catch (cause) {
    throw new PactError('INVALID_OPTION', {
      option: `oauth.${name}`,
      reason: 'provider config failed schema validation',
    }, cause as Error);
  }
  const preset = PROVIDERS[config.kind];
  if (preset === undefined) {
    throw new PactError('INVALID_OPTION', {
      option: `oauth.${name}.kind`,
      reason: `unknown provider kind '${String(config.kind)}'`,
    });
  }
  // `{tenant}` is path-positioned so a hostile value cannot break the
  // host, but `?`/`#` would still mutate path/query of every endpoint —
  // pin the charset as defense-in-depth.
  if (
    config.tenant !== undefined && !/^[A-Za-z0-9._-]+$/.test(config.tenant)
  ) {
    throw new PactError('INVALID_OPTION', {
      option: `oauth.${name}.tenant`,
      reason: 'must contain only A-Z, a-z, 0-9, dot, underscore, or hyphen',
    });
  }
  if (config.kind === 'OIDC') {
    // Discovery + the code/secret exchange run against this issuer, and
    // it is the trust anchor for the id_token's `iss`; refuse plaintext
    // so credentials, the discovered `jwks_uri`, and the id_token can't
    // be MITM'd.
    if (config.issuer === undefined || !config.issuer.startsWith('https://')) {
      throw new PactError('INVALID_OPTION', {
        option: `oauth.${name}.issuer`,
        reason: 'the OIDC kind requires an https issuer',
      });
    }
    return new URL(config.issuer).origin;
  }
  return new URL(preset.token.replace('{tenant}', config.tenant ?? 'common'))
    .origin;
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
  private readonly __preset: PactOAuthProviderPreset;
  /** JWKS-backed id_token verifier (owns its own key cache). */
  private readonly __idTokens: IdTokenVerifier;
  /** Discovered oidc endpoints (fetched once, then cached). */
  private __discovered?: Endpoints;
  /** When {@link OAuthClient.__discovered} was fetched (epoch ms). */
  private __discoveredAt = 0;

  /**
   * Create a client for one configured provider instance. Endpoints
   * come from the named preset; the `OIDC` kind instead resolves them
   * by discovery against `config.issuer`. Nothing is fetched here —
   * discovery is deferred to first use.
   *
   * @throws {PactError} `INVALID_OPTION` on an unknown kind or a
   *   missing/non-https `OIDC` issuer.
   */
  constructor(
    name: string,
    config: PactOAuthProviderConfig,
    onIdTokenUnverified?: (reason: string) => void,
  ) {
    super({ baseURL: resolveAnchor(name, config) });
    this.__name = name;
    this.__config = config;
    this.__preset = PROVIDERS[config.kind];
    this.__idTokens = new IdTokenVerifier(name, () => this._fetch, {
      policy: config.idToken,
      onDegraded: onIdTokenUnverified,
    });
  }

  /** The configured instance name. */
  get name(): string {
    return this.__name;
  }

  /** Whether first logins may auto-provision via the createUser hook. */
  get autoProvision(): boolean {
    return this.__config.autoProvision === true;
  }

  /**
   * Build the authorization redirect URL plus the `state` (CSRF token),
   * PKCE `verifier`, and OIDC `nonce` the consumer must hold until the
   * callback.
   *
   * @throws {PactError} `OAUTH_EXCHANGE_FAILED` for an `OIDC` kind when
   *   discovery fails or declares a non-https endpoint.
   */
  async authorizationUrl(): Promise<
    { url: string; state: string; verifier: string; nonce?: string }
  > {
    const endpoints = await this.__endpoints();
    const state = nanoID(32);
    const verifier = nanoID(64);
    const oidc = this.__preset.oidc === true;
    const nonce = oidc ? nanoID(32) : undefined;
    const url = new URL(endpoints.authorization);
    const params: Record<string, string> = {
      // App-supplied params FIRST — every pact-generated param below
      // wins, so config `authParams` can never override `state`, PKCE,
      // `nonce`, or `redirect_uri` and desync (or weaken) the flow.
      ...this.__preset.authParams,
      ...this.__config.authParams,
      response_type: 'code',
      client_id: this.__config.clientId,
      redirect_uri: this.__config.redirectUri,
      scope: (this.__config.scopes ?? this.__preset.scopes).join(' '),
      ...(nonce !== undefined ? { nonce } : {}),
      state,
      code_challenge: await s256(verifier),
      code_challenge_method: 'S256',
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return { url: url.toString(), state, verifier, nonce };
  }

  /**
   * Finish the flow: (fail-closed) `state` check, code + PKCE verifier
   * → token exchange, and profile resolution — userinfo fetch, or
   * verified `id_token` when the provider publishes no userinfo
   * endpoint. Fails closed when the normalized profile carries no
   * subject rather than mint a fabricated `'undefined'` principal.
   *
   * @throws {PactError} `OAUTH_STATE_MISMATCH` on a state mismatch;
   *   `OAUTH_EXCHANGE_FAILED` on a failed exchange;
   *   `OAUTH_PROFILE_FAILED` on a failed profile fetch / id_token
   *   decode / subject-less profile; `OAUTH_IDTOKEN_INVALID` on a
   *   rejected id_token; `OAUTH_JWKS_UNAVAILABLE` under the
   *   `'REQUIRED'` policy when the key set is unobtainable.
   */
  async callback(params: PactOAuthCallbackParams): Promise<PactOAuthProfile> {
    // Fail closed: once the caller opts into CSRF protection by
    // supplying `expectedState`, a missing or mismatched callback
    // `state` is rejected — dropping the param cannot bypass the check.
    if (
      params.expectedState !== undefined &&
      params.state !== params.expectedState
    ) {
      throw new PactError('OAUTH_STATE_MISMATCH', { provider: this.__name });
    }
    const tokens = await this.__exchange(params.code, params.verifier);
    // The nonce guarantee must hold on the USERINFO identity path too:
    // when the caller supplied an expectedNonce and the exchange
    // returned an id_token, verify it even though identity comes from
    // userinfo — otherwise the replay guard is silently a no-op for
    // exactly the providers most apps use.
    if (
      this.__preset.identity !== 'id_token' &&
      params.expectedNonce !== undefined && tokens.idToken !== undefined
    ) {
      await this.__idTokenIdentity(tokens, params);
    }
    const raw = this.__preset.identity === 'id_token'
      ? await this.__idTokenIdentity(tokens, params)
      : await this.__userinfo(tokens, params);
    const profile = this.__preset.profile(raw);
    // Fail closed on a subject-less profile: minting a principal from a
    // fabricated '<provider>:undefined' id would silently merge
    // distinct users into one account.
    const id = profile.id;
    if (id === undefined) {
      throw new PactError('OAUTH_PROFILE_FAILED', {
        provider: this.__name,
        reason: 'profile is missing a subject identifier',
      });
    }
    return { provider: this.__name, ...profile, id, raw, tokens };
  }

  // ── internals ─────────────────────────────────────────────────────

  /**
   * Identity from the `id_token` — signature-checked against the
   * provider's JWKS and claim-validated.
   */
  private async __idTokenIdentity(
    tokens: PactOAuthTokens,
    params: PactOAuthCallbackParams,
  ): Promise<Record<string, unknown>> {
    const endpoints = await this.__endpoints();
    return await this.__idTokens.verify(tokens.idToken, {
      jwksUri: endpoints.jwks,
      // For OIDC the anchor is the CONFIGURED (https-validated) issuer —
      // checking a token against an issuer the discovery document itself
      // supplied would be circular.
      issuer: this.__config.kind === 'OIDC'
        ? this.__config.issuer
        : this.__preset.issuer,
      audience: this.__config.clientId,
      nonce: params.expectedNonce,
    });
  }

  /** Preset endpoints, with oidc discovery cached. */
  private async __endpoints(): Promise<Endpoints> {
    if (this.__config.kind === 'OIDC') {
      // Re-discover past the TTL so a rotated `jwks_uri`/endpoint is not
      // pinned until restart.
      if (
        this.__discovered === undefined ||
        Date.now() - this.__discoveredAt > DISCOVERY_TTL_MS
      ) {
        const issuer = this.__config.issuer!.replace(/\/$/, '');
        let doc: Record<string, unknown>;
        try {
          doc = await this.__getJson(
            `${issuer}/.well-known/openid-configuration`,
            'OIDC discovery',
          );
        } catch (err) {
          // A refetch that fails must not discard a still-valid cached
          // document — serve the stale copy and, since __discoveredAt is
          // left unadvanced, retry on the next call. Only a cold cache
          // is fatal. Mirrors the JWKS degrade-on-refetch policy.
          if (this.__discovered !== undefined) return this.__discovered;
          throw err;
        }
        let discovered: {
          authorization_endpoint: string;
          token_endpoint: string;
          userinfo_endpoint?: string;
          jwks_uri?: string;
        };
        try {
          discovered = DISCOVERY_SCHEMA.parse(doc) as typeof discovered;
        } catch (cause) {
          throw new PactError('OAUTH_EXCHANGE_FAILED', {
            provider: this.__name,
            reason: 'discovery document failed schema validation',
          }, cause as Error);
        }
        this.__discoveredAt = Date.now();
        this.__discovered = {
          authorization: this.__requireHttps(
            discovered.authorization_endpoint,
            'authorization',
          ),
          token: this.__requireHttps(discovered.token_endpoint, 'token'),
          userinfo: discovered.userinfo_endpoint === undefined
            ? undefined
            : this.__requireHttps(discovered.userinfo_endpoint, 'userinfo'),
          // https-enforced here too (symmetric with the other three) —
          // the verifier's own check only DEGRADES under 'PREFERRED'.
          jwks: discovered.jwks_uri === undefined
            ? undefined
            : this.__requireHttps(discovered.jwks_uri, 'jwks'),
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
   * Reject a discovered endpoint that isn't `https`. The endpoints a
   * discovery document DECLARES are attacker-influenceable data — and
   * the token endpoint carries the code + client_secret while userinfo
   * carries the bearer token.
   *
   * @throws {PactError} `OAUTH_EXCHANGE_FAILED` when `endpoint` is not
   *   an `https://` URL.
   */
  private __requireHttps(endpoint: string, kind: string): string {
    if (!endpoint.startsWith('https://')) {
      throw new PactError('OAUTH_EXCHANGE_FAILED', {
        provider: this.__name,
        reason: `discovery returned a non-https ${kind} endpoint`,
      });
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
      throw new PactError('OAUTH_EXCHANGE_FAILED', {
        provider: this.__name,
        reason: 'transport failure',
      }, cause as Error);
    }
    if (status === null || status < 200 || status >= 300) {
      throw new PactError('OAUTH_EXCHANGE_FAILED', {
        provider: this.__name,
        reason: `token endpoint returned ${status}`,
        error: raw.error,
      });
    }
    let tokens: {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };
    try {
      tokens = TOKEN_RESPONSE_SCHEMA.parse(raw) as typeof tokens;
    } catch (cause) {
      throw new PactError('OAUTH_EXCHANGE_FAILED', {
        provider: this.__name,
        reason: 'token response failed schema validation',
      }, cause as Error);
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresIn: tokens.expires_in,
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
      'profile fetch',
      { Authorization: `Bearer ${tokens.accessToken}` },
      'OAUTH_PROFILE_FAILED',
    );
  }

  /**
   * GET an absolute URL expecting a JSON object body.
   *
   * @throws {PactError} with `code` on transport failure or a non-2xx /
   *   non-object response.
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
      throw new PactError(code, {
        provider: this.__name,
        reason: `${what} transport failure`,
      }, cause as Error);
    }
    if (
      status === null || status < 200 || status >= 300 ||
      typeof body !== 'object' || body === null
    ) {
      throw new PactError(code, {
        provider: this.__name,
        reason: `${what} returned ${status}`,
      });
    }
    return body as Record<string, unknown>;
  }
}

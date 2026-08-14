/**
 * @fileoverview In-house OAuth2 / OIDC client — authorization-code + PKCE.
 *
 * Zero external dependencies: Web Crypto for the S256 challenge, `nanoID`
 * for `state`/`verifier`, `fetch` injected by the facade (so tests stub it
 * and the runtime uses compat's fetch). Stateless by design — the consumer
 * holds `state`/`verifier` between the redirect and the callback.
 *
 * Flow:
 * 1. {@link OAuthClient.authorizationUrl} → `{ url, state, verifier }`
 * 2. consumer redirects, provider calls back with `code` (+ `state`)
 * 3. {@link OAuthClient.callback} → exchange code (PKCE) → fetch profile, or
 *    verify the `id_token` when the provider has no userinfo endpoint
 *    ({@link IdTokenVerifier}) → normalized {@link OAuthProfile}
 *
 * @module
 */

import { nanoID } from '@tundralibs/id';
import { PactDefinitionError, PactOAuthError } from '../errors/mod.ts';
import { type ProviderPreset, PROVIDERS } from './providers.ts';
import { IdTokenVerifier } from './IdTokenVerifier.ts';
import type {
  AuthorizationUrlOptions,
  CallbackParams,
  OAuthProfile,
  OAuthProviderConfig,
  OAuthTokens,
} from '../types/mod.ts';

/** `fetch` supplier — late-bound so the facade's test seam stays live. */
export type FetchRef = () => typeof globalThis.fetch;

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

/**
 * One configured OAuth provider instance. Composed by the `PACT` facade
 * (one per `oauth` option entry) but usable standalone.
 */
export class OAuthClient {
  private readonly __name: string;
  private readonly __config: OAuthProviderConfig;
  private readonly __preset: ProviderPreset;
  private readonly __fetchRef: FetchRef;
  /** JWKS-backed id_token verifier (owns its own key cache). */
  private readonly __idTokens: IdTokenVerifier;
  /** Discovered oidc endpoints (fetched once, then cached). */
  private __discovered?: Endpoints;

  /**
   * Create a client for one configured provider instance. Endpoints come from
   * the named preset; the `oidc` preset instead resolves them by discovery
   * against `config.issuer`, which must be https because it is also the trust
   * anchor for the returned `id_token`. Nothing is fetched here — discovery is
   * deferred to first use.
   *
   * @param name - the configured instance name
   * @param config - the provider-instance configuration
   * @param fetchRef - late-bound `fetch` supplier
   * @param onIdTokenUnverified - notified when id_token signature
   *   verification degraded to decode-only under the `'preferred'` policy;
   *   the facade turns this into the `idTokenUnverified` event.
   * @throws {@link PactDefinitionError} when `config.provider` is unknown
   *   (`UNKNOWN_PROVIDER`), or the `oidc` preset is missing an issuer
   *   (`MISSING_OPTION`) / has a non-https issuer (`INVALID_OPTION`).
   */
  constructor(
    name: string,
    config: OAuthProviderConfig,
    fetchRef: FetchRef,
    onIdTokenUnverified?: (reason: string) => void,
  ) {
    const preset = PROVIDERS[config.provider];
    if (preset === undefined) {
      throw new PactDefinitionError(
        `OAuth instance '${name}' references unknown provider '${config.provider}'`,
        { code: 'UNKNOWN_PROVIDER', instance: name },
      );
    }
    if (config.provider === 'oidc') {
      if (!config.issuer) {
        throw new PactDefinitionError(
          `OAuth instance '${name}' uses the oidc preset and requires an issuer`,
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
    }
    this.__name = name;
    this.__config = config;
    this.__preset = preset;
    this.__fetchRef = fetchRef;
    this.__idTokens = new IdTokenVerifier(name, fetchRef, {
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
   * Build the authorization redirect URL plus the `state` (CSRF token) and
   * PKCE `verifier` the consumer must hold until the callback.
   *
   * @throws {@link PactOAuthError} (`OAUTH_EXCHANGE_FAILED`) for an `oidc`
   *   preset when discovery fails or the discovery document declares a
   *   non-https authorization/token/userinfo endpoint.
   */
  async authorizationUrl(
    options?: AuthorizationUrlOptions,
  ): Promise<{ url: string; state: string; verifier: string }> {
    const endpoints = await this.__endpoints();
    const state = options?.state ?? nanoID(32);
    const verifier = nanoID(64);
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
      ...this.__preset.authParams,
      ...this.__config.authParams,
      ...options?.params,
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return { url: url.toString(), state, verifier };
  }

  /**
   * Finish the flow: (optionally) check `state`, exchange the code + PKCE
   * verifier for tokens, and resolve the normalized profile. Fails closed
   * when the normalized profile carries no subject (`id`) claim rather than
   * mint a fabricated `'<provider>:undefined'` principal.
   *
   * @throws {@link PactOAuthError} on state mismatch
   *   (`OAUTH_STATE_MISMATCH`), a failed exchange (`OAUTH_EXCHANGE_FAILED`),
   *   a failed profile fetch / id_token decode / a profile with no subject
   *   (`OAUTH_PROFILE_FAILED`), a rejected id_token (`OAUTH_IDTOKEN_INVALID`),
   *   or an unobtainable key set under the `'required'` policy
   *   (`OAUTH_JWKS_UNAVAILABLE`).
   */
  async callback(params: CallbackParams): Promise<OAuthProfile> {
    // Fail closed: once the caller opts into CSRF protection by supplying
    // `expectedState`, a missing or mismatched callback `state` is rejected —
    // an attacker cannot bypass the check by dropping the `state` param. [M3]
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
    // Fail closed on a subject-less profile. A nonconforming/misconfigured IdP
    // (dropped claims mapping, or a 200 error body) can return a payload with
    // no subject claim; minting a principal from a fabricated
    // '<provider>:undefined' id would silently merge distinct users into one
    // account. Conforming providers always send the subject.
    const id = profile.id;
    if (id === undefined) {
      throw new PactOAuthError(
        `OAuth profile for '${this.__name}' is missing a subject identifier`,
        { code: 'OAUTH_PROFILE_FAILED', provider: this.__name },
      );
    }
    return {
      provider: this.__name,
      ...profile,
      id,
      raw,
      tokens,
    };
  }

  // ── internals ─────────────────────────────────────────────────────

  /**
   * Identity from the `id_token` — signature-checked against the provider's
   * JWKS and claim-validated. See {@link IdTokenVerifier} for the failure
   * policy when the key set cannot be reached.
   */
  private async __idTokenIdentity(
    tokens: OAuthTokens,
    params: CallbackParams,
  ): Promise<Record<string, unknown>> {
    const endpoints = await this.__endpoints();
    return await this.__idTokens.verify(tokens.idToken, {
      jwksUri: endpoints.jwks,
      // For oidc the anchor is the *configured* (https-validated) issuer —
      // checking a token against an issuer the discovery document itself
      // supplied would be circular.
      issuer: this.__config.provider === 'oidc'
        ? this.__config.issuer
        : this.__preset.issuer,
      audience: this.__config.clientId,
      nonce: params.expectedNonce,
    });
  }

  /** Preset endpoints, with `{tenant}` applied and oidc discovery cached. */
  private async __endpoints(): Promise<Endpoints> {
    if (this.__config.provider === 'oidc') {
      if (this.__discovered === undefined) {
        const issuer = this.__config.issuer!.replace(/\/$/, '');
        const url = `${issuer}/.well-known/openid-configuration`;
        const res = await this.__fetchRef()(url);
        if (!res.ok) {
          throw new PactOAuthError(
            `OIDC discovery failed for '${this.__name}' (${res.status})`,
            {
              code: 'OAUTH_EXCHANGE_FAILED',
              provider: this.__name,
              status: res.status,
            },
          );
        }
        const doc = await res.json() as Record<string, unknown>;
        this.__discovered = {
          authorization: this.__requireHttps(
            String(doc.authorization_endpoint),
            'authorization',
          ),
          token: this.__requireHttps(String(doc.token_endpoint), 'token'),
          userinfo: typeof doc.userinfo_endpoint === 'string'
            ? this.__requireHttps(doc.userinfo_endpoint, 'userinfo')
            : undefined,
          // `jwks_uri` is validated (https) again downstream by the verifier.
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
   * Reject a discovered endpoint that isn't `https`. The discovery document
   * arrives over the https-validated issuer, but the endpoints it *declares*
   * are still attacker-influenceable data — and the token endpoint carries
   * the authorization `code` + `client_secret` while userinfo carries the
   * bearer access token, so a plaintext (or downgraded) endpoint would
   * exfiltrate them. Extends the https guard already enforced on the
   * configured issuer and on `jwks_uri`. [L1]
   *
   * @throws {@link PactOAuthError} (`OAUTH_EXCHANGE_FAILED`) when `endpoint`
   *   is not an `https://` URL.
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
  ): Promise<OAuthTokens> {
    const endpoints = await this.__endpoints();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.__config.redirectUri,
      client_id: this.__config.clientId,
      code_verifier: verifier,
    });
    if (this.__config.clientSecret !== undefined) {
      body.set('client_secret', this.__config.clientSecret);
    }
    const res = await this.__fetchRef()(endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    const raw = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok || typeof raw.access_token !== 'string') {
      throw new PactOAuthError(
        `OAuth code exchange failed for '${this.__name}' (${res.status})`,
        {
          code: 'OAUTH_EXCHANGE_FAILED',
          provider: this.__name,
          status: res.status,
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
    tokens: OAuthTokens,
    params: CallbackParams,
  ): Promise<Record<string, unknown>> {
    const endpoints = await this.__endpoints();
    if (endpoints.userinfo === undefined) {
      // No userinfo endpoint (e.g. an oidc issuer that publishes none) —
      // identity falls back to the id_token, which is verified.
      return await this.__idTokenIdentity(tokens, params);
    }
    const res = await this.__fetchRef()(endpoints.userinfo, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new PactOAuthError(
        `OAuth profile fetch failed for '${this.__name}' (${res.status})`,
        {
          code: 'OAUTH_PROFILE_FAILED',
          provider: this.__name,
          status: res.status,
        },
      );
    }
    return await res.json() as Record<string, unknown>;
  }
}

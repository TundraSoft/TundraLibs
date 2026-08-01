/**
 * @fileoverview Built-in OAuth provider presets.
 *
 * Each preset supplies the three things a provider varies on: endpoints,
 * default scopes, and a `profile()` normalizer from the raw userinfo (or
 * id_token) payload to PACT's neutral shape. Endpoint/quirk reference:
 * the providers' own docs (Arctic's provider list was used as a map of
 * which quirks exist — the code here is ours).
 *
 * Provider quirks handled here:
 * - **GitHub** speaks form-encoded by default — the client sends
 *   `Accept: application/json` on token exchange for everyone (harmless
 *   elsewhere), and the primary email may be `null` without extra scope.
 * - **Microsoft** endpoints are tenant-scoped (`{tenant}`, default
 *   `common`).
 * - **Apple** has **no userinfo endpoint** — identity comes from the
 *   `id_token` returned by the (TLS, server-to-server) token exchange, so
 *   the preset reads it instead of fetching. The preset therefore also
 *   carries `jwks`/`issuer` so {@link IdTokenVerifier} can check that
 *   token's signature and `iss`. Apple also requires
 *   `response_mode=form_post` when scopes are requested, and its client
 *   secret is an ES256 JWT the consumer mints out-of-band.
 * - **oidc** (generic) discovers endpoints from
 *   `<issuer>/.well-known/openid-configuration` — handled by the client,
 *   including `jwks_uri`; the preset only carries scopes + the
 *   standard-claims normalizer.
 *
 * @module
 */

import type { OAuthProviderKind } from '../types/mod.ts';

/** Raw profile payload → normalized fields (sans instance/tokens). */
export type ProfileNormalizer = (raw: Record<string, unknown>) => {
  /**
   * Provider-scoped subject id, or `undefined` when the payload carries no
   * subject claim. {@link OAuthClient.callback} rejects a subject-less
   * profile rather than mint a principal — never the fabricated literal
   * `'undefined'`, which would collapse distinct users into one account.
   */
  id: string | undefined;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  avatar?: string;
};

/** One provider preset — endpoints, default scopes, profile normalizer. */
export type ProviderPreset = {
  /** Authorization endpoint (may contain `{tenant}`). Empty for `oidc`. */
  authorization: string;
  /** Token endpoint (may contain `{tenant}`). Empty for `oidc`. */
  token: string;
  /** Userinfo endpoint; absent when identity comes from the id_token. */
  userinfo?: string;
  /**
   * JWKS endpoint used to verify the `id_token` signature. Only meaningful
   * for presets whose identity comes from the id_token — the userinfo
   * providers never treat the id_token as the identity source. Discovered
   * from `jwks_uri` for `oidc`.
   */
  jwks?: string;
  /**
   * Expected `iss` on the id_token. Fixed per preset; for `oidc` the
   * *configured* issuer is used instead (see {@link IdTokenContext}).
   */
  issuer?: string;
  /** Default scopes (overridable per config). */
  scopes: string[];
  /** Extra authorization-URL params the provider requires. */
  authParams?: Record<string, string>;
  /** Identity source: `userinfo` fetch (default) or `id_token` decode. */
  identity?: 'userinfo' | 'id_token';
  profile: ProfileNormalizer;
};

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/**
 * Required subject identifier: a present scalar → its string form, else
 * `undefined`. Unlike a bare `String(...)`, a missing/null claim never
 * becomes the literal `'undefined'`/`'null'` — a fabricated id would let two
 * subject-less profiles collapse into one `'<provider>:undefined'` principal.
 * The client fails the login when this returns `undefined`.
 */
const subject = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.length > 0 ? v : undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
};

export const PROVIDERS: Record<OAuthProviderKind, ProviderPreset> = {
  google: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
    profile: (raw) => ({
      id: subject(raw.sub),
      email: str(raw.email),
      emailVerified: raw.email_verified === true,
      name: str(raw.name),
      avatar: str(raw.picture),
    }),
  },

  github: {
    authorization: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    userinfo: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
    profile: (raw) => ({
      id: subject(raw.id),
      email: str(raw.email),
      name: str(raw.name) ?? str(raw.login),
      avatar: str(raw.avatar_url),
    }),
  },

  microsoft: {
    authorization:
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
    userinfo: 'https://graph.microsoft.com/oidc/userinfo',
    scopes: ['openid', 'email', 'profile'],
    profile: (raw) => ({
      id: subject(raw.sub),
      email: str(raw.email),
      name: str(raw.name),
      avatar: str(raw.picture),
    }),
  },

  discord: {
    authorization: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    userinfo: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
    profile: (raw) => ({
      id: subject(raw.id),
      email: str(raw.email),
      emailVerified: raw.verified === true,
      name: str(raw.global_name) ?? str(raw.username),
      avatar: str(raw.avatar)
        ? `https://cdn.discordapp.com/avatars/${String(raw.id)}/${
          String(raw.avatar)
        }.png`
        : undefined,
    }),
  },

  facebook: {
    authorization: 'https://www.facebook.com/v18.0/dialog/oauth',
    token: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userinfo: 'https://graph.facebook.com/me?fields=id,name,email,picture',
    scopes: ['email', 'public_profile'],
    profile: (raw) => ({
      id: subject(raw.id),
      email: str(raw.email),
      name: str(raw.name),
      avatar: str(
        (raw.picture as { data?: { url?: unknown } } | undefined)?.data?.url,
      ),
    }),
  },

  apple: {
    authorization: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys',
    issuer: 'https://appleid.apple.com',
    scopes: ['name', 'email'],
    // Apple requires form_post when name/email scopes are requested.
    authParams: { response_mode: 'form_post' },
    identity: 'id_token',
    profile: (raw) => ({
      id: subject(raw.sub),
      email: str(raw.email),
      // Apple reports it as boolean or the string 'true'.
      emailVerified: raw.email_verified === true ||
        raw.email_verified === 'true',
    }),
  },

  oidc: {
    authorization: '', // resolved via issuer discovery
    token: '',
    scopes: ['openid', 'email', 'profile'],
    profile: (raw) => ({
      id: subject(raw.sub),
      email: str(raw.email),
      emailVerified: raw.email_verified === true,
      name: str(raw.name),
      avatar: str(raw.picture),
    }),
  },
};

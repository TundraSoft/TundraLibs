/**
 * @fileoverview OAuth provider-instance configuration for `@tundralibs/pact`.
 * @module
 */

import type { IdTokenVerificationPolicy } from './IdTokenVerificationPolicy.ts';
import type { OAuthProfile } from './OAuthProfile.ts';
import type { OAuthProviderKind } from './OAuthProviderKind.ts';
import type { PACTLoginOutcome } from './PACTLoginOutcome.ts';

/** Configuration for one OAuth provider instance (`oauth` option entry). */
export type OAuthProviderConfig = {
  /** Which preset drives endpoints + profile normalization. */
  provider: OAuthProviderKind;
  clientId: string;
  /**
   * Client secret — omit for public PKCE-only clients. Note Apple's
   * "secret" is itself a short-lived ES256 JWT the consumer must mint
   * out-of-band (crypt is HS/RS-only) and pass here.
   */
  clientSecret?: string;
  /** Redirect URI registered with the provider. */
  redirectUri: string;
  /** Override the preset's default scopes. */
  scopes?: string[];
  /** `oidc` preset only: the issuer URL for discovery. */
  issuer?: string;
  /** `microsoft` preset only: tenant id. Defaults to `common`. */
  tenant?: string;
  /** Extra authorization-URL query params (merged over the preset's). */
  authParams?: Record<string, string>;
  /**
   * How strictly to treat an unobtainable JWKS when verifying the
   * `id_token` — see {@link IdTokenVerificationPolicy}. Only consulted for
   * providers whose identity comes from the id_token (`apple`, and an
   * `oidc` issuer with no userinfo endpoint). A bad signature or claim is
   * rejected under either setting.
   *
   * @default 'preferred'
   */
  idTokenVerification?: IdTokenVerificationPolicy;
  /**
   * How long a fetched JWKS stays cached, in milliseconds. An unrecognised
   * `kid` forces a refresh before the TTL expires (rate-limited), so this is
   * an upper bound on staleness, not on key rotation.
   *
   * @default 3600000
   */
  jwksCacheTtl?: number;
  /**
   * Map the normalized profile to your principal (find-or-create). When
   * omitted, `login()` falls back to
   * `{ id: '<instance>:<profile.id>', profile }`.
   */
  map?: (profile: OAuthProfile) => PACTLoginOutcome | Promise<PACTLoginOutcome>;
};

/**
 * @fileoverview OAuth provider-instance configuration for
 * `@tundralibs/pact`. Federated identity flows through the
 * `getUser({by:'OAUTH'})` and `createUser` hooks, so the link-vs-create
 * policy lives in app code — there is no `map` callback.
 *
 * @module
 */

import type { PactClaimSpec } from './PactClaimSpec.ts';
import type { PactOAuthProviderKind } from './PactOAuthProviderKind.ts';

/** Configuration for one OAuth provider instance (`oauth` option entry). */
export type PactOAuthProviderConfig = {
  /** Which preset drives endpoints + profile normalization. */
  provider: PactOAuthProviderKind;
  clientId: string;
  /**
   * Client secret — omit for public PKCE-only clients. Apple's "secret" is
   * a short-lived ES256 JWT the consumer mints out-of-band.
   */
  clientSecret?: string;
  /** Redirect URI registered with the provider. */
  redirectUri: string;
  /** Override the preset's default scopes. */
  scopes?: string[];
  /** `OIDC` preset only: the issuer URL for discovery. */
  issuer?: string;
  /** `MICROSOFT` preset only: tenant id. Defaults to `common`. */
  tenant?: string;
  /** Extra authorization-URL query params (merged over the preset's). */
  authParams?: Record<string, string>;
  /**
   * Declared scope-dependent claims (output name → {@link PactClaimSpec}).
   * Drives both ends: merged into the OIDC `claims` request parameter on
   * OIDC-speaking presets, and extracted + sanitized from the raw payload
   * into `profile.claims` on callback. Fail-soft — missing/uncastable
   * claims are absent. The right `scopes` still gate what providers
   * actually return.
   */
  claims?: Record<string, PactClaimSpec>;
  /**
   * How strictly to treat an unobtainable JWKS when verifying the
   * `id_token`. A bad signature or claim is rejected under either setting.
   *
   * @default 'PREFERRED'
   */
  idTokenVerification?: 'PREFERRED' | 'REQUIRED';
  /**
   * How long a fetched JWKS stays cached, in milliseconds.
   *
   * @default 3600000
   */
  jwksCacheTtl?: number;
};

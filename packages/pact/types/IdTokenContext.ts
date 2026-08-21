/**
 * @fileoverview Per-call `id_token` verification context for
 * `@tundralibs/pact` OAuth instances.
 * @module
 */

/** Per-call verification context resolved by {@link OAuthClient}. */
export type IdTokenContext = {
  /**
   * The provider's JWKS endpoint (preset constant, or `jwks_uri` from the
   * OIDC discovery document). Absent when the provider publishes none.
   */
  jwksUri?: string;
  /**
   * Expected `iss`. For `oidc` this is the **configured** issuer, not the
   * one echoed by the discovery document — validating a token against an
   * issuer the document supplied would be circular.
   */
  issuer?: string;
  /** Expected `aud` — the instance's `clientId`. */
  audience: string;
  /** Expected `nonce`, when the caller supplied one. */
  nonce?: string;
};

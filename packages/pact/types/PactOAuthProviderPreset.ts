import type { PactOAuthProfileNormalizer } from './PactOAuthProfileNormalizer.ts';

/**
 * One provider preset — endpoints, default scopes, and the profile
 * normalizer. Endpoints may contain `{tenant}`, substituted from the
 * instance config (default `'common'`).
 */
export type PactOAuthProviderPreset = {
  /** Authorization endpoint. Empty for `OIDC` (resolved by discovery). */
  authorization: string;
  /** Token endpoint. Empty for `OIDC` (resolved by discovery). */
  token: string;
  /** Userinfo endpoint; absent when identity comes from the id_token. */
  userinfo?: string;
  /** JWKS endpoint for id_token verification; discovered for `OIDC`. */
  jwks?: string;
  /** Expected `iss` on the id_token; for `OIDC` the CONFIGURED issuer
   * is the anchor instead. */
  issuer?: string;
  /** Default scopes (overridable per config). */
  scopes: string[];
  /** Extra authorization-URL params the provider requires. */
  authParams?: Record<string, string>;
  /** Identity source: `userinfo` fetch (default) or `id_token` decode. */
  identity?: 'userinfo' | 'id_token';
  /** Whether the provider understands the OIDC `nonce` param. */
  oidc?: boolean;
  profile: PactOAuthProfileNormalizer;
};

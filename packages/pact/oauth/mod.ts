/**
 * @fileoverview `@tundralibs/pact/oauth` — the OAuth2/OIDC client layer:
 * the restler-based authorization-code + PKCE client, the JWKS-backed
 * id_token verifier, and the provider presets. Composed by the `Pact`
 * engine (one client per `oauth` option entry) but usable standalone.
 *
 * @module
 */

export { OAuthClient } from './OAuthClient.ts';
export {
  type IdTokenContext,
  type IdTokenVerificationPolicy,
  IdTokenVerifier,
  type IdTokenVerifierOptions,
} from './IdTokenVerifier.ts';
export {
  type ProfileNormalizer,
  type ProviderPreset,
  PROVIDERS,
} from './providers.ts';
export type {
  PactAuthorizationUrlOptions,
  PactOAuthCallbackParams,
  PactOAuthProfile,
  PactOAuthProviderKind,
  PactOAuthTokens,
} from '../types/mod.ts';

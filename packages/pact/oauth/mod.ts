/**
 * @fileoverview `@tundralibs/pact/oauth` — the OAuth2/OIDC client layer:
 * the restler-based authorization-code + PKCE client, the JWKS-backed
 * id_token verifier, and the provider presets. Composed by the `Pact`
 * engine (one client per `oauth` option entry) but usable standalone.
 *
 * @module
 */

export { OAuthClient } from './OAuthClient.ts';
export { IdTokenVerifier } from './IdTokenVerifier.ts';
export { PROVIDERS } from './providers.ts';

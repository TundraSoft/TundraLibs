/**
 * Internal OAuth engine for pact — the per-instance client, its id_token
 * verifier, and the built-in provider presets. Not a public subpath
 * (yet): the engine surface is `Pact.oauthRedirect` / `Pact.oauthLogin`.
 *
 * @module
 */
export {
  type OAuthCallbackParams,
  OAuthClient,
} from './OAuthClient.ts';
export { IdTokenVerifier } from './IdTokenVerifier.ts';
export { type ProviderPreset, PROVIDERS } from './providers.ts';

/**
 * @fileoverview Built-in OAuth provider identifiers for `@tundralibs/pact`.
 * @module
 */

/** Built-in provider presets (endpoints + scopes + profile normalizer). */
export type PactOAuthProviderKind =
  | 'GOOGLE'
  | 'GITHUB'
  | 'MICROSOFT'
  | 'DISCORD'
  | 'FACEBOOK'
  | 'APPLE'
  | 'OIDC';

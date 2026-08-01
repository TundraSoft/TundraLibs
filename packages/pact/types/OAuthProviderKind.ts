/**
 * @fileoverview Built-in OAuth provider identifiers for `@tundralibs/pact`.
 * @module
 */

/** Built-in provider presets (endpoints + scopes + profile normalizer). */
export type OAuthProviderKind =
  | 'google'
  | 'github'
  | 'microsoft'
  | 'discord'
  | 'facebook'
  | 'apple'
  | 'oidc';

/**
 * Built-in OAuth provider presets. `OIDC` is the generic
 * discovery-driven preset covering any spec-compliant issuer
 * (Auth0, Cognito, Entra, Keycloak, …); more named presets are additive.
 */
export type PactOAuthProviderKind = 'GITHUB' | 'GOOGLE' | 'OIDC';

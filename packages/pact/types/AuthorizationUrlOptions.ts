/**
 * @fileoverview Options type for `PACT.getAuthorizationUrl` /
 * `OAuthClient.authorizationUrl`.
 * @module
 */

/** Options for building an OAuth authorization URL. */
export type AuthorizationUrlOptions = {
  /** Override the generated `state` (else a fresh nanoID). */
  state?: string;
  /** Override the configured/default scopes. */
  scopes?: string[];
  /** Extra query params merged over preset + config params. */
  params?: Record<string, string>;
};

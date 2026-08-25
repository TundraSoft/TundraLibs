/**
 * @fileoverview Options type for `Pact.oauthRedirect` /
 * `OAuthClient.authorizationUrl`.
 * @module
 */

/** Options for building an OAuth authorization URL. */
export type PactAuthorizationUrlOptions = {
  /** Override the generated `state` (else a fresh nanoID). */
  state?: string;
  /** Override the configured/default scopes. */
  scopes?: string[];
  /** Extra query params merged over preset + config params. */
  params?: Record<string, string>;
};

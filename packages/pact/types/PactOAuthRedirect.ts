/**
 * Everything the application must hold between the redirect and the
 * callback — stow it (cookie / server-side session) and pass it back to
 * `oauthLogin` as `expected`. Pact holds no state between the two calls.
 */
export type PactOAuthRedirect = {
  /** The authorization URL to redirect the user to. */
  readonly url: string;
  /** CSRF token — must round-trip through the provider unchanged. */
  readonly state: string;
  /** PKCE verifier for the code exchange. */
  readonly codeVerifier: string;
  /** OIDC replay guard; present for OIDC-speaking providers. */
  readonly nonce?: string;
};

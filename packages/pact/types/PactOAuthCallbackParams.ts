/**
 * @fileoverview OAuth callback parameters for `@tundralibs/pact` — the
 * credentials for `login('<oauth instance>', …)` and
 * `OAuthClient.callback`. The framework extracts `code`/`state` from the
 * provider redirect; the app supplies the `expected*` values it held since
 * `oauthRedirect()`.
 *
 * @module
 */

/** Parameters completing an OAuth authorization-code flow. */
export type PactOAuthCallbackParams = {
  /** The authorization code from the provider redirect. */
  code: string;
  /** The PKCE verifier returned by `oauthRedirect()`. */
  verifier: string;
  /** The `state` the provider sent back. */
  state?: string;
  /**
   * The `state` returned by `oauthRedirect()`. Once supplied, a missing
   * or mismatched callback `state` is rejected — fail-closed CSRF guard.
   */
  expectedState?: string;
  /**
   * The `nonce` returned by `oauthRedirect()`. Once supplied, the
   * `id_token`'s `nonce` claim must match — fail-closed replay guard.
   */
  expectedNonce?: string;
};

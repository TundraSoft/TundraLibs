/**
 * @fileoverview Callback-parameters type for `PACT.handleCallback` /
 * `OAuthClient.callback`.
 * @module
 */

/** Callback parameters for finishing an OAuth flow. */
export type CallbackParams = {
  /** The authorization code from the provider redirect. */
  code: string;
  /** The PKCE verifier returned by `getAuthorizationUrl`. */
  verifier: string;
  /** The `state` echoed back by the provider (checked when both given). */
  state?: string;
  /** The `state` you stored at redirect time (checked when both given). */
  expectedState?: string;
  /**
   * The `nonce` you sent on the authorization request (via
   * `getAuthorizationUrl`'s `params`) and stored alongside `state`. Only
   * meaningful for providers whose identity comes from the `id_token`.
   *
   * Fail-closed like `expectedState`: once supplied, an `id_token` whose
   * `nonce` is missing or different is rejected
   * (`OAUTH_IDTOKEN_INVALID`) — a provider or attacker cannot disable the
   * replay guard by omitting the claim.
   */
  expectedNonce?: string;
};

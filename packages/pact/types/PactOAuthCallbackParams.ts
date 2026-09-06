/**
 * Callback inputs for the OAuth client — the provider's callback params
 * plus what the consumer stowed at redirect time. The engine assembles
 * this from `oauthLogin`'s arguments.
 */
export type PactOAuthCallbackParams = {
  code: string;
  state?: string;
  /** Fail-closed once supplied: a missing callback `state` rejects. */
  expectedState?: string;
  /** PKCE verifier from the redirect step. */
  verifier: string;
  /** Fail-closed once supplied, mirroring `expectedState`. */
  expectedNonce?: string;
};

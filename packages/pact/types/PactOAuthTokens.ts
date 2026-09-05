/**
 * Tokens returned by the provider's code exchange. Pact neither stores
 * nor refreshes these — they ride the login result once for the
 * application to use or discard.
 */
export type PactOAuthTokens = {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly idToken?: string;
  /** Seconds until the access token expires, when the provider says. */
  readonly expiresIn?: number;
  /** The verbatim token-endpoint response body. */
  readonly raw: Record<string, unknown>;
};

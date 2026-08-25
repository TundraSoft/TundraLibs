/**
 * @fileoverview OAuth token-set type for `@tundralibs/pact`.
 * @module
 */

/** Tokens returned by the code exchange. */
export type PactOAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  /** OIDC identity token (JWT) when the provider issues one. */
  idToken?: string;
  /** Seconds until `accessToken` expires, when reported. */
  expiresIn?: number;
  /** Raw token-endpoint response for anything not normalized. */
  raw: Record<string, unknown>;
};

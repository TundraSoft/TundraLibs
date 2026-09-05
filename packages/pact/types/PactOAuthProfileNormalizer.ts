/**
 * Raw provider payload → pact's neutral profile fields (sans instance
 * name and tokens, which the client attaches).
 */
export type PactOAuthProfileNormalizer = (raw: Record<string, unknown>) => {
  /**
   * Provider-scoped subject id, or `undefined` when the payload carries
   * no subject claim. The client rejects a subject-less profile rather
   * than mint a principal — never the fabricated literal `'undefined'`,
   * which would collapse distinct users into one account.
   */
  id: string | undefined;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  avatar?: string;
};

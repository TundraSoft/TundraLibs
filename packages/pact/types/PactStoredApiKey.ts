/**
 * @fileoverview Stored API-key contract for `@tundralibs/pact` — what the
 * `getApiKey` hook returns. One record shape serves both presentation
 * styles: `APIKEY` (secret presented, only its hash stored) and `HMAC`
 * (secret never presented — the stored secret verifies signatures).
 *
 * @module
 */

/** API-key record (`APIKEY` and `HMAC` schemes). */
export type PactStoredApiKey = {
  /** Public key id (`<prefix>_ak_…`). */
  id: string;
  userId: string;
  /** sha-256 of the shown-once secret — `APIKEY` scheme. */
  secretHash?: string;
  /**
   * The signing secret — `HMAC` scheme only, which must hold the real
   * secret to verify signatures. Store encrypted at rest (crypt
   * `encryptAES`) when the backing store warrants it; omit entirely for
   * presented-secret keys.
   */
  secret?: string;
  /** Optional scoped grants — override the user's when present. */
  grants?: Record<string, string>;
  revokedAt?: number;
};

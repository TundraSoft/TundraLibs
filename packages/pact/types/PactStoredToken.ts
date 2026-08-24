/**
 * @fileoverview Stored simple-token contract for `@tundralibs/pact` — what
 * the `getToken` hook returns and `saveToken` persists. The token itself
 * is never stored: records are keyed by its sha-256 hash.
 *
 * @module
 */

/** Simple static token record (`TOKEN` scheme). */
export type PactStoredToken = {
  /** sha-256 hex of the token — the lookup key `getToken` receives. */
  hash: string;
  userId: string;
  /** Optional scoped grants — override the user's when present. */
  grants?: Record<string, string>;
  /** Epoch ms; omitted = non-expiring. */
  expiresAt?: number;
  revokedAt?: number;
  metadata?: Record<string, unknown>;
};

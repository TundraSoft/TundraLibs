/**
 * @fileoverview Stored-user contract for `@tundralibs/pact` — what the
 * `getUser` hook returns. The app owns the schema; this is only the shape
 * pact reads.
 *
 * @module
 */

/**
 * The user record a {@link PactHooks.getUser} hook resolves. `grants` are
 * the principal's EFFECTIVE per-module masks (serialized decimal strings) —
 * pre-composed by the app from whatever it models (direct, groups, roles);
 * pact ships the mask algebra in `./authz` but never resolves membership.
 */
export type PactStoredUser = {
  /** Stable unique id — becomes the JWT `sub`. */
  id: string;
  /**
   * crypt `pbkdf2Hash` string; consulted only on the `IDENTIFIER` lookup
   * path. Omit for password-less (OAuth-only) accounts.
   */
  secret?: string;
  /**
   * TOTP seed for secondary verification — present = MFA enrolled.
   * Store encrypted at rest (crypt `encryptAES`) when warranted; pact
   * only reads it inside `verifyOtp`/`enrollOtp` and never puts it on
   * the principal.
   */
  otpSecret?: string;
  /** Effective per-module masks, serialized as decimal strings. */
  grants?: Record<string, string>;
  /** Non-`ACTIVE` principals fail `can`/`assert` and cannot log in. */
  status?: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  metadata?: Record<string, unknown>;
};

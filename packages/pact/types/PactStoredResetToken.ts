import type { PactTokenPurpose } from './PactTokenPurpose.ts';

/**
 * A single-use action token record — password reset and email
 * verification share it — keyed by the sha-256 of the token. The raw
 * token is returned once by `requestPasswordReset` /
 * `requestEmailVerification` for the application to deliver out-of-band.
 * Single use is enforced by the `consumeResetToken` hook contract:
 * return AND delete. `purpose` is checked AFTER consumption, so a token
 * presented to the wrong flow is rejected and burned.
 */
export type PactStoredResetToken = {
  /** sha-256 of the token — the lookup key. */
  readonly id: string;
  /** The user the token was minted for. */
  readonly userId: string;
  /** The flow the token completes. */
  readonly purpose: PactTokenPurpose;
  /** Absolute expiry of the window. */
  readonly expiresAt: Date;
  /**
   * Code-kind email verification only: sha-256 of the six-digit code. The
   * record's `id` is then derived from the user, not the code, so a new
   * code replaces the old one.
   */
  readonly code?: string;
  /** Code-kind only: wrong guesses spent on this code so far. */
  readonly attempts?: number;
};

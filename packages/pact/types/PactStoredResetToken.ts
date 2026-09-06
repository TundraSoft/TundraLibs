/**
 * A single-use password-reset token record, keyed by the sha-256 of the
 * token — the raw token is returned once by `requestPasswordReset` for
 * the application to deliver out-of-band. Single use is enforced by the
 * `consumeResetToken` hook contract: return AND delete.
 */
export type PactStoredResetToken = {
  /** sha-256 of the reset token — the lookup key. */
  readonly id: string;
  /** The user the reset was requested for. */
  readonly userId: string;
  /** Absolute expiry of the reset window. */
  readonly expiresAt: Date;
};

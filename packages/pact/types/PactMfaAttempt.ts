/**
 * The outcome of `attemptMFA`. `LOCKED` means the user is past
 * `options.mfa.maxAttempts` in the current window — the code was not
 * checked — and `window` is that window in minutes.
 */
export type PactMfaAttempt =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'INVALID_CODE' }
  | { readonly ok: false; readonly reason: 'LOCKED'; readonly window: number };

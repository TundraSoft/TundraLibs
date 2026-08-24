/**
 * @fileoverview Successful-login result for `@tundralibs/pact`.
 *
 * @module
 */

import type { PactOAuthProfile } from './PactOAuthProfile.ts';
import type { PactPrincipal } from './PactPrincipal.ts';

/** What `login()` and `refresh()` resolve on success. */
export type PactLoginResult = {
  principal: PactPrincipal;
  /** Short-lived access JWT, or the opaque session id. */
  token: string;
  /** Present when `session.refresh` is enabled. */
  refreshToken?: string;
  /** Epoch ms expiry of `token`. */
  expiresAt: number;
  isNew: boolean;
  /**
   * OAuth logins only: the FRESH verified profile from this login —
   * normalized fields plus the complete `raw` claims payload (scope-
   * dependent extras like `birthdate` land there). Present on EVERY
   * OAuth login, not just the first, so the app can sync updated claims
   * into its own store (via `updateUser` or directly).
   */
  profile?: PactOAuthProfile;
};

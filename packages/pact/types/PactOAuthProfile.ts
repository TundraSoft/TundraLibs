/**
 * @fileoverview Normalized OAuth profile type for `@tundralibs/pact`.
 * @module
 */

import type { PactClaimValue } from './PactClaimValue.ts';
import type { PactOAuthTokens } from './PactOAuthTokens.ts';

/**
 * Normalized identity a provider callback resolves — handed to the
 * `getUser({by:'OAUTH'})` lookup and, on first login, to `createUser`
 * inside the draft's `oauth` block. Also rides `PactLoginResult.profile`
 * on every OAuth login.
 */
export type PactOAuthProfile = {
  /** The configured provider instance name (e.g. `'google'`). */
  provider: string;
  /** Provider-scoped stable subject id. */
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  /** Avatar/picture URL when the provider exposes one. */
  avatar?: string;
  /**
   * The claims DECLARED in the provider config, sanitized per their
   * `PactClaimSpec` — missing/uncastable ones are absent. `raw` remains
   * the complete payload; this is convenience on top, not a replacement.
   */
  claims?: Record<string, PactClaimValue>;
  /** Raw userinfo/profile payload. */
  raw: Record<string, unknown>;
  /** The exchanged tokens (pass on or discard — pact does not store them). */
  tokens: PactOAuthTokens;
};

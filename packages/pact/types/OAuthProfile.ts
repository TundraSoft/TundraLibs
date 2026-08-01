/**
 * @fileoverview Normalized OAuth profile type for `@tundralibs/pact`.
 * @module
 */

import type { OAuthTokens } from './OAuthTokens.ts';

/** Normalized identity returned by `PACT.handleCallback`. */
export type OAuthProfile = {
  /** The configured provider instance name (e.g. `'google'`). */
  provider: string;
  /** Provider-scoped stable subject id. */
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  /** Avatar/picture URL when the provider exposes one. */
  avatar?: string;
  /** Raw userinfo/profile payload. */
  raw: Record<string, unknown>;
  /** The exchanged tokens (pass on or discard — PACT does not store them). */
  tokens: OAuthTokens;
};

/**
 * @fileoverview New-user draft for `@tundralibs/pact` — what the
 * `createUser` hook receives.
 *
 * @module
 */

import type { PactOAuthProfile } from './PactOAuthProfile.ts';

/**
 * Draft handed to the `createUser` hook. On federated first login pact
 * passes the verified `oauth` block; the app decides link-vs-create — the
 * account-takeover-sensitive policy stays in app code, never in pact.
 */
export type PactNewUser = {
  identifier?: string;
  /** Already pbkdf2-hashed by pact — store verbatim. */
  secret?: string;
  /** Verified federated identity, present on OAuth first login. */
  oauth?: { provider: string; subject: string; profile: PactOAuthProfile };
  /** Effective per-module masks, serialized as decimal strings. */
  grants?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

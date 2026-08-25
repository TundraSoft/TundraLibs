/**
 * @fileoverview Result union for custom login strategies in
 * `@tundralibs/pact` — the typed replacement for Passport's
 * `done(err, user, info)` protocol.
 *
 * @module
 */

import type { PactStoredUser } from './PactStoredUser.ts';

/** What a custom strategy resolves to. */
export type PactStrategyResult =
  | { ok: true; user: PactStoredUser; isNew?: boolean }
  | { ok: false; reason?: string };

/**
 * @fileoverview The storage seam of `@tundralibs/pact` — a flat object of
 * OPTIONAL hook callbacks. No abstract class, no adapter, no schema
 * ownership: each hook is a plain sync-or-async function returning plain
 * data, and pact does all crypto itself, so hooks never see anything but
 * opaque hash strings. Enabling a capability gates its hooks (validated at
 * construction; see the requiredness table on the `Pact` constructor).
 *
 * @module
 */

import type { JWTPayload } from '@tundralibs/crypt/JWT';
import type { PactNewUser } from './PactNewUser.ts';
import type { PactStoredApiKey } from './PactStoredApiKey.ts';
import type { PactStoredSession } from './PactStoredSession.ts';
import type { PactStoredToken } from './PactStoredToken.ts';
import type { PactStoredUser } from './PactStoredUser.ts';
import type { PactUserQuery } from './PactUserQuery.ts';

/** Every hook may be sync or async. */
type MaybePromise<T> = T | Promise<T>;

/** The flat, all-optional storage hooks. */
export type PactHooks = {
  // ── identity ─────────────────────────────────────────────────────
  /** The ONE lookup — see {@link PactUserQuery} for the three keys. */
  getUser?: (query: PactUserQuery) => MaybePromise<PactStoredUser | null>;
  /** Enables `register()` and OAuth first-login provisioning. */
  createUser?: (draft: PactNewUser) => MaybePromise<PactStoredUser>;
  /** Enables `setPassword()`, `enrollOtp()`, and profile/grants writes. */
  updateUser?: (
    id: string,
    patch: Partial<PactStoredUser>,
  ) => MaybePromise<void>;

  // ── sessions / refresh families ('OPAQUE' strategy or refresh on) ─
  saveSession?: (session: PactStoredSession) => MaybePromise<void>;
  getSession?: (id: string) => MaybePromise<PactStoredSession | null>;
  deleteSession?: (id: string) => MaybePromise<void>;
  /** Enables `logoutAll()`. */
  deleteUserSessions?: (userId: string) => MaybePromise<void>;

  // ── api keys ('APIKEY' + 'HMAC' schemes) ─────────────────────────
  getApiKey?: (keyId: string) => MaybePromise<PactStoredApiKey | null>;
  saveApiKey?: (record: PactStoredApiKey) => MaybePromise<void>;
  revokeApiKey?: (keyId: string) => MaybePromise<void>;

  // ── simple tokens ('TOKEN' scheme; records keyed by sha-256) ─────
  getToken?: (tokenHash: string) => MaybePromise<PactStoredToken | null>;
  saveToken?: (record: PactStoredToken) => MaybePromise<void>;

  // ── policy (not storage) ─────────────────────────────────────────
  /**
   * Verify-time veto for JWTs — an extra guard for deployments that keep
   * a denylist. Session revocation itself is served by the refresh-family
   * and opaque-session paths.
   */
  isRevoked?: (claims: JWTPayload) => MaybePromise<boolean>;
};

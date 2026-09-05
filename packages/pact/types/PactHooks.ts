import type { PactCreateUserInput } from './PactCreateUserInput.ts';
import type { PactPrincipal } from './PactPrincipal.ts';
import type { PactStoredApiKey } from './PactStoredApiKey.ts';
import type { PactStoredPasskey } from './PactStoredPasskey.ts';
import type { PactStoredResetToken } from './PactStoredResetToken.ts';
import type { PactStoredSession } from './PactStoredSession.ts';
import type { PactStoredUser } from './PactStoredUser.ts';
import type { PactUserQuery } from './PactUserQuery.ts';

/**
 * Bring-your-own-storage seams: flat, optional, Promise-friendly
 * callbacks. Pact calls them, caches what they return (per the cache
 * config), and treats storage — including how secrets are encrypted at
 * rest — as the application's concern.
 *
 * Actor ids share ONE namespace across principal kinds (user ids and
 * API-key ids must not collide — prefix them if needed); pact uses the
 * id verbatim as the principal cache key.
 */
export type PactHooks<M extends string = string> = {
  /**
   * Resolve an actor id to its principal, with EFFECTIVE per-module
   * grants already composed (how they compose — direct, groups, roles —
   * is the application's concern). Return `null` when the actor does
   * not exist or must not authorize (e.g. not ACTIVE) — never throw for
   * absence.
   */
  getPrincipal?: (
    id: string,
  ) => PactPrincipal<M> | null | Promise<PactPrincipal<M> | null>;
  /**
   * Fetch a stored user by the discriminated query. Return `null` for
   * no match — never throw for absence. When configured, id-based
   * principal resolution derives from this hook (a `getPrincipal` hook,
   * if also present, takes precedence).
   */
  getUser?: (
    query: PactUserQuery,
  ) => PactStoredUser | null | Promise<PactStoredUser | null>;
  /**
   * Persist a new user (register sugar / OAuth auto-provisioning) and
   * return the stored record.
   */
  createUser?: (
    input: PactCreateUserInput,
  ) => PactStoredUser | Promise<PactStoredUser>;
  /** Persist a freshly issued API key — encrypt `secret` at rest. */
  saveApiKey?: (key: PactStoredApiKey) => void | Promise<void>;
  /** Revoke a key: delete it or flip its status to a non-active one. */
  revokeApiKey?: (keyId: string) => void | Promise<void>;
  /**
   * Persist a minted session (already keyed by the token's sha-256).
   * Without this hook sessions live only in the session cache —
   * single-process, lost on restart.
   */
  saveSession?: (session: PactStoredSession) => void | Promise<void>;
  /**
   * Fetch a stored session by id (the token's sha-256). Return `null`
   * for no match. Without this hook, bearer validation reads the
   * session cache as the store (cache-only mode).
   */
  getSession?: (
    sessionId: string,
  ) => PactStoredSession | null | Promise<PactStoredSession | null>;
  /**
   * Fetch a stored API key by id with `secret` DECRYPTED (see
   * `PactStoredApiKey`). Return `null` for no match — never throw for
   * absence.
   */
  getApiKey?: (
    keyId: string,
  ) => PactStoredApiKey | null | Promise<PactStoredApiKey | null>;
  /** Delete one session by id (logout). Absence is not an error. */
  deleteSession?: (sessionId: string) => void | Promise<void>;
  /** Delete every session of a user (logout-all, password change). */
  deleteSessions?: (userId: string) => void | Promise<void>;
  /** Store a user's new password hash (already pbkdf2-hashed). */
  setPassword?: (
    userId: string,
    passwordHash: string,
  ) => void | Promise<void>;
  /** Persist a single-use reset token (already keyed by sha-256). */
  saveResetToken?: (record: PactStoredResetToken) => void | Promise<void>;
  /**
   * Return AND delete the reset token in one motion — single use by
   * construction. `null` when absent or already consumed.
   */
  consumeResetToken?: (
    id: string,
  ) => PactStoredResetToken | null | Promise<PactStoredResetToken | null>;
  /**
   * Fetch one passkey by credential id (base64url). Return `null` for
   * no match — never throw for absence. Required, with the other three
   * passkey hooks, when `options.passkeys` is configured.
   */
  getPasskey?: (
    id: string,
  ) => PactStoredPasskey | null | Promise<PactStoredPasskey | null>;
  /** Every passkey of one user — feeds excludeCredentials on
   * registration and allowCredentials on identifier-first login. */
  getPasskeys?: (
    userId: string,
  ) => readonly PactStoredPasskey[] | Promise<readonly PactStoredPasskey[]>;
  /** Persist a newly registered passkey. */
  savePasskey?: (record: PactStoredPasskey) => void | Promise<void>;
  /**
   * Store an advanced signature counter after a verified assertion — a
   * keyed update on purpose, never a blind upsert of the whole record.
   * Guard it against going backwards (`... WHERE sign_count < ?`) so
   * concurrent assertions cannot race the clone check.
   */
  updatePasskeyCounter?: (
    id: string,
    signCount: number,
  ) => void | Promise<void>;
};

import type { PactCreateUserInput } from './PactCreateUserInput.ts';
import type { PactOAuthProfile } from './PactOAuthProfile.ts';
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
   * {@link getPrincipal} for many ids in one store round trip (`WHERE id
   * IN (...)`): return the principals that exist and may authorize, in any
   * order, and leave the rest out. `principalsOf` calls it with the ids
   * the principal cache did not hold; ids it leaves out are still tried as
   * API keys. Requires `getPrincipal`, so single and batch lookups resolve
   * alike.
   */
  getPrincipals?: (
    ids: readonly string[],
  ) => readonly PactPrincipal<M>[] | Promise<readonly PactPrincipal<M>[]>;
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
  /**
   * Map the identifier pact derives for an OAuth auto-provisioned user
   * (the verified email, else `provider:subject`) to the one it checks
   * for duplicates and stores. Use it when each tenant has its own
   * accounts: provider `acme:entra` can yield `acme::alice@x.com`, so the
   * same person can hold separate accounts in two tenants. Absent, the
   * derived identifier is used as-is.
   */
  oauthIdentifier?: (
    identifier: string,
    profile: PactOAuthProfile,
  ) => string | Promise<string>;
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
   * absence. The returned `grants` are what the key may do; pact does not
   * compare them with the owner's. A key whose owner is inactive is
   * already refused, but to bound a key by its owner's current grants
   * (or its tenant's status), compute `grants` / `status` here.
   */
  getApiKey?: (
    keyId: string,
  ) => PactStoredApiKey | null | Promise<PactStoredApiKey | null>;
  /** Delete one session by id (logout). Absence is not an error. */
  deleteSession?: (sessionId: string) => void | Promise<void>;
  /** Delete every session of a user (logout-all, password change). */
  deleteSessions?: (userId: string) => void | Promise<void>;
  /**
   * Replace pact's PBKDF2 password hashing, e.g. to add a pepper. pact
   * calls it wherever it hashes: register, `setPassword`, reset, and the
   * dummy hash for unknown users. Configure together with
   * `verifyPassword`; the `password` option is then not allowed.
   */
  hashPassword?: (password: string) => string | Promise<string>;
  /**
   * Check a password against a hash from `hashPassword`. Return `false`
   * for a wrong password; throw only for a failure that is not the
   * user's fault, which pact surfaces instead of `INVALID_CREDENTIALS`.
   */
  verifyPassword?: (
    password: string,
    stored: string,
  ) => boolean | Promise<boolean>;
  /** Store a user's new password hash (already hashed). */
  setPassword?: (
    userId: string,
    passwordHash: string,
  ) => void | Promise<void>;
  /**
   * Atomically record `step` as the user's last accepted TOTP time step,
   * only if it is later than the stored one, and return whether it was
   * recorded. This makes a TOTP code single-use across replicas (RFC 6238
   * §5.2), e.g. `UPDATE users SET totp_step = $2 WHERE id = $1 AND
   * (totp_step IS NULL OR totp_step < $2)`, true when a row changed.
   * Without it pact tracks steps in process memory, which protects one
   * process only.
   */
  claimTotpStep?: (userId: string, step: number) => boolean | Promise<boolean>;
  /**
   * Count one MFA attempt and return the attempts in the current window,
   * starting a `window`-second window when none is live (a redis `INCR` +
   * `EXPIRE NX`). `verifyMFA` throws `MFA_LOCKED` above
   * `options.mfa.maxAttempts`. Without it, counts live in process memory.
   */
  countMfaAttempt?: (
    userId: string,
    window: number,
  ) => number | Promise<number>;
  /** Clear the user's MFA attempt count after a successful verification. */
  resetMfaAttempts?: (userId: string) => void | Promise<void>;
  /**
   * Atomically record `nonce` for the API key `keyId`, kept `ttl` seconds,
   * and return whether it was recorded — `false` when the key already used
   * it (a redis `SET <keyId>:<nonce> 1 NX EX <ttl>`). The HMAC middleware
   * calls it for every signed request whose template signs `${x-nonce}`,
   * so a captured request cannot be replayed inside the timestamp window.
   * Without it pact remembers nonces in process memory, which protects
   * one process only.
   */
  claimNonce?: (
    keyId: string,
    nonce: string,
    ttl: number,
  ) => boolean | Promise<boolean>;
  /** Persist a single-use action token — password reset or email
   * verification, told apart by `purpose` (already keyed by sha-256). */
  saveResetToken?: (record: PactStoredResetToken) => void | Promise<void>;
  /**
   * Return AND delete the action token in one motion — single use by
   * construction. `null` when absent or already consumed. It must be
   * atomic, e.g. `DELETE … WHERE id = $1 RETURNING *`: a read followed by
   * a delete lets two concurrent attempts both succeed. Return the record
   * whatever its `purpose`: pact checks it after consumption, so a token
   * presented to the wrong flow is rejected and burned.
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

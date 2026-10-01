import type { PBKDF2Hash } from '@tundralibs/crypt/digest';
import type { PactCacheConfig } from './PactCacheConfig.ts';
import type { PactOAuthProviderConfig } from './PactOAuthProviderConfig.ts';
import type { PactPasskeyConfig } from './PactPasskeyConfig.ts';

/**
 * Tunable behavior only — the structural definition (bits,
 * modulePermissions) lives on the class as readonly fields, not in the
 * option store.
 */
export type PactOptions = {
  /**
   * Prefix stamped on every generated token/secret (1-4 alphanumeric
   * characters).
   * @default 'pact'
   */
  secretPrefix?: string;
  /**
   * Hook-result caching — see {@link PactCacheConfig}. OPT-IN: leave
   * unset and every resolution hits the hooks. The cacher instance NAME
   * is deliberately not an option — see `Pact._cacheName`.
   */
  cache?: PactCacheConfig;
  /**
   * OAuth provider instances by name — see
   * {@link PactOAuthProviderConfig}. Clients are built eagerly at
   * construction so config errors surface immediately.
   */
  oauth?: Record<string, PactOAuthProviderConfig>;
  /**
   * Session behavior. `ttl` (minutes, absolute, never sliding) is the
   * session lifetime — under `strategy: 'JWT'` it becomes the
   * ACCESS-token lifetime while `refresh.ttl` bounds the family. The
   * JWT strategy requires an HS256 `secret` of at least 32 characters
   * and enables `refresh()` rotation with reuse detection
   * (`refresh.grace` seconds absorb concurrent-refresh races).
   * @default { ttl: 480, strategy: 'OPAQUE', refresh: { ttl: 10080, grace: 30 } }
   */
  session?: {
    ttl?: number;
    strategy?: 'OPAQUE' | 'JWT';
    secret?: string;
    refresh?: { ttl?: number; grace?: number };
  };
  /**
   * Passkey (WebAuthn) relying-party configuration — see
   * {@link PactPasskeyConfig}. Configuring it enables the four ceremony
   * methods and makes the passkey hooks required at construction, so
   * misconfiguration fails at boot rather than mid-request.
   */
  passkeys?: PactPasskeyConfig;
  /**
   * PBKDF2 settings for new password hashes (register, `setPassword`,
   * reset, and the dummy hash that equalizes unknown-user timing).
   * Stored hashes record their own count, so changing this never breaks
   * existing logins. Cloudflare Workers refuses more than 100 000
   * iterations, so a Workers deployment sets `iterations: 100_000`. Not
   * allowed together with the `hashPassword` / `verifyPassword` hooks.
   * @default crypt's `pbkdf2Hash` defaults: 600 000 iterations of SHA-256
   */
  password?: { iterations?: number; hash?: PBKDF2Hash };
  /**
   * Password-reset behavior; `ttl` is the reset-token validity window
   * in minutes.
   * @default { ttl: 15 }
   */
  reset?: { ttl?: number };
  /**
   * Email-verification behavior; `ttl` is the verification-token
   * validity window in minutes.
   * @default { ttl: 1440 }
   */
  verification?: { ttl?: number };
  /**
   * TOTP brute-force limit for `verifyMFA`: at most `maxAttempts` attempts
   * per user per `window` minutes, after which it throws `MFA_LOCKED`
   * until the window ends. A successful verification resets the count.
   * `maxAttempts: 0` turns the limit off.
   * @default { maxAttempts: 5, window: 15 }
   */
  mfa?: { maxAttempts?: number; window?: number };
};

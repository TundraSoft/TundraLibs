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
   * Password-reset behavior; `ttl` is the reset-token validity window
   * in minutes.
   * @default { ttl: 15 }
   */
  reset?: { ttl?: number };
};

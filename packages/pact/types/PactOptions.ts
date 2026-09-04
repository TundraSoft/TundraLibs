import type { PactCacheConfig } from './PactCacheConfig.ts';
import type { PactOAuthProviderConfig } from './PactOAuthProviderConfig.ts';

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
   * Hook-result caching — see {@link PactCacheConfig}. Defaults to the
   * MEMORY engine with `ttl: { principal: 15, apiKey: 5, session: 5 }`
   * (minutes). The cacher instance NAME is deliberately not an option —
   * see `Pact._cacheName`.
   */
  cache?: PactCacheConfig;
  /**
   * OAuth provider instances by name — see
   * {@link PactOAuthProviderConfig}. Clients are built eagerly at
   * construction so config errors surface immediately.
   */
  oauth?: Record<string, PactOAuthProviderConfig>;
  /**
   * Opaque-session behavior; `ttl` is the session LIFETIME in minutes
   * (absolute, never sliding).
   * @default { ttl: 480 }
   */
  session?: { ttl?: number };
  /**
   * Password-reset behavior; `ttl` is the reset-token validity window
   * in minutes.
   * @default { ttl: 15 }
   */
  reset?: { ttl?: number };
};

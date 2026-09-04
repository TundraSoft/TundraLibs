import type { PactOAuthTokens } from './PactOAuthTokens.ts';

/**
 * Normalized identity from a completed OAuth flow — delivered on EVERY
 * OAuth login so the application can sync changed claims. `raw` is the
 * unmodified provider payload for anything the normalizer drops.
 */
export type PactOAuthProfile = {
  /** The configured instance name that produced this profile. */
  readonly provider: string;
  /** Provider-scoped subject id. */
  readonly id: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly name?: string;
  readonly avatar?: string;
  readonly raw: Record<string, unknown>;
  readonly tokens: PactOAuthTokens;
};

/**
 * @fileoverview Constructor options for the `Pact` engine.
 *
 * @module
 */

import type { PactHooks } from './PactHooks.ts';
import type { PactModulePermissions } from './PactModulePermissions.ts';
import type { PactOAuthProviderConfig } from './PactOAuthProviderConfig.ts';
import type { PactPermissionBits } from './PactPermissionBits.ts';
import type { PactSessionConfig } from './PactSessionConfig.ts';
import type { PactStrategy } from './PactStrategy.ts';

/**
 * Options for `Pact`. Enabling a login method or credential scheme gates
 * its hooks — the constructor validates the capability→hook table and
 * throws on a gap.
 *
 * @typeParam P - the permission registry type (name → bit).
 */
export type PactOptions<P extends PactPermissionBits = PactPermissionBits> = {
  // ── authorization kernel ─────────────────────────────────────────
  /** Base permission registry (name → BigInt bit). Required. */
  bits: P;
  /** Optional module catalog — unknown module/permission then throws. */
  modules?: PactModulePermissions<P>;

  // ── storage seam ─────────────────────────────────────────────────
  hooks?: PactHooks;

  // ── tokens (held OUT of the option store; never surfaced) ────────
  secret?: string | { privateKey: string; publicKey: string };
  /** @default 'HS256' */
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
  issuer?: string;
  audience?: string | string[];
  session?: PactSessionConfig;

  // ── login methods & credential schemes (each gates its hooks) ────
  /** Enables `login('password')` and the `BASIC` scheme. */
  password?: boolean | { identifierField?: string };
  /** Enables the `APIKEY` + `HMAC` schemes and `issueApiKey()`. */
  apiKeys?: boolean | { prefix?: string };
  /** Enables the `TOKEN` scheme and `issueToken()`. */
  tokens?: boolean | { prefix?: string };
  oauth?: Record<string, PactOAuthProviderConfig>;
  /** Externally-verified methods (LDAP, magic-link, SSO). */
  strategies?: Record<string, PactStrategy>;
};

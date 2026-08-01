/**
 * @fileoverview Constructor options for the `PACT` facade — the `O` type
 * parameter of the `Options` base. Every field is made optional at the
 * call-site by `EventOptionKeys` (to allow defaults), so PACT validates the
 * genuinely-required ones (`bits`) at construction.
 *
 * @module
 */

import type { JWTAlgorithm } from '@tundralibs/crypt/JWT';
import type { GroupResolver } from './GroupResolver.ts';
import type { LoginStrategy } from './LoginStrategy.ts';
import type { OAuthProviderConfig } from './OAuthProviderConfig.ts';
import type { PACTKeyPair } from './PACTKeyPair.ts';
import type { PACTModulePermissions } from './PACTModulePermissions.ts';
import type { PACTPermissionBits } from './PACTPermissionBits.ts';
import type { PACTRevocationCheck } from './PACTRevocationCheck.ts';

/**
 * Options for `PACT`.
 *
 * @typeParam P - the permission registry type (name → bit).
 */
export type PACTOptions<P extends PACTPermissionBits = PACTPermissionBits> = {
  // authorization
  /** Base permission registry (name → BigInt bit). Required. */
  bits: P;
  /**
   * Optional module catalog (module → applicable permissions). When present,
   * enables validation — unknown module or inapplicable permission throws.
   */
  modules?: PACTModulePermissions<P>;

  // groups (consumer-owned; PACT resolves + caches)
  /**
   * Hook that fetches group grants — see {@link GroupResolver}. Required for
   * the `*ForGroups` methods and `syncGroups()`.
   */
  groupResolver?: GroupResolver;
  /**
   * Milliseconds between automatic re-syncs of every cached group. `0`
   * (default) disables the timer — call `syncGroups()` yourself. The timer
   * is unref'd and can be stopped with `stopSync()`.
   *
   * @default 0
   */
  syncInterval?: number;

  // tokens (delegated to @tundralibs/crypt)
  /**
   * JWT algorithm — any crypt-supported value (`HS256`/`384`/`512`,
   * `RS256`/`384`/`512`). Verification pins to this algorithm.
   *
   * @default 'HS256'
   */
  algorithm?: JWTAlgorithm;
  /**
   * Key material: a shared secret string for `HS*`, or a {@link PACTKeyPair}
   * for `RS*`. Validated against `algorithm` at construction. Omit for an
   * authorization-only PACT (token methods then throw `MISSING_OPTION`).
   */
  secret?: string | PACTKeyPair;
  /**
   * Token lifetime in seconds — sets `exp = iat + expiry` on issue and the
   * extension window on refresh.
   *
   * @default 3600
   */
  expiry?: number;
  /** `iss` claim stamped on issue and enforced on verify (when set). */
  issuer?: string;
  /** `aud` claim stamped on issue and enforced on verify (when set). */
  audience?: string | string[];
  /** `kid` header stamped on issued tokens — for key-rotation schemes. */
  keyId?: string;
  /** Verify-time revocation seam — see {@link PACTRevocationCheck}. */
  isRevoked?: PACTRevocationCheck;

  // login / oauth
  /**
   * Named credential strategies — `login(name, credentials)` runs the
   * matching one. See {@link LoginStrategy}.
   */
  strategies?: Record<string, LoginStrategy>;
  /**
   * OAuth provider instances (instance name → config). Each acts as a
   * built-in login strategy: `getAuthorizationUrl(name)` →
   * `login(name, { code, verifier })`.
   */
  oauth?: Record<string, OAuthProviderConfig>;
  /**
   * Issue a JWT (`sub = principal.id`) on every successful `login()` and
   * return it as `result.token`. Requires `secret`.
   *
   * @default false
   */
  autoIssue?: boolean;
};

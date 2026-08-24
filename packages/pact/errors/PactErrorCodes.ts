/**
 * @fileoverview Stable error codes for `@tundralibs/pact`.
 *
 * Every {@link PactError} carries a `code` from this union so callers can
 * branch on `err.code` instead of matching message text.
 *
 * @module
 */

/** Union of every stable {@link PactError} code. */
export type PactErrorCode =
  | 'UNKNOWN'
  | 'MISSING_OPTION'
  | 'INVALID_OPTION'
  | 'MISSING_HOOK'
  | 'DUPLICATE_PERMISSION_BIT'
  | 'INVALID_PERMISSION_BIT'
  | 'UNKNOWN_MODULE'
  | 'UNKNOWN_PERMISSION'
  | 'PERMISSION_NOT_IN_MODULE'
  | 'PERMISSION_DENIED'
  | 'TOKEN_REVOKED'
  | 'TOKEN_TYPE_MISMATCH'
  | 'REFRESH_REUSED'
  | 'INVALID_GRANTS'
  | 'UNKNOWN_STRATEGY'
  | 'UNKNOWN_PROVIDER'
  | 'OAUTH_STATE_MISMATCH'
  | 'OAUTH_EXCHANGE_FAILED'
  | 'OAUTH_PROFILE_FAILED'
  | 'OAUTH_IDTOKEN_INVALID'
  | 'OAUTH_JWKS_UNAVAILABLE';

/**
 * Code → short human description. Used by docs/tooling that want a label
 * for a code; the thrown message is built inline at each throw site.
 */
export const PactErrorCodes: Record<PactErrorCode, string> = {
  /** Fallback when an error is constructed without an explicit code. */
  UNKNOWN: 'Unknown pact error',
  /** A required constructor option was not provided. */
  MISSING_OPTION: 'A required option was not provided',
  /** An option value is malformed for the configured algorithm/mode. */
  INVALID_OPTION: 'An option value is invalid for the configuration',
  /** An enabled capability was used without its storage hook wired. */
  MISSING_HOOK: 'A capability was used without its storage hook wired',
  /** Two permissions in the registry map to the same bit value. */
  DUPLICATE_PERMISSION_BIT: 'Two permissions map to the same bit value',
  /** A permission bit is not a positive BigInt. */
  INVALID_PERMISSION_BIT: 'Permission bit must be a positive BigInt',
  /** A module is not declared in the module catalog. */
  UNKNOWN_MODULE: 'Module is not declared in the module catalog',
  /** A permission is not declared in the permission registry. */
  UNKNOWN_PERMISSION: 'Permission is not declared in the permission registry',
  /** A permission is not applicable to the given module. */
  PERMISSION_NOT_IN_MODULE: 'Permission is not applicable to the module',
  /** A principal lacks the required permission (authorization denied). */
  PERMISSION_DENIED: 'Principal lacks the required permission',
  /** A structurally valid token was rejected (revocation / dead family). */
  TOKEN_REVOKED: 'Token has been revoked',
  /** A refresh token was presented as an access token, or the reverse. */
  TOKEN_TYPE_MISMATCH: 'Token type does not match the operation',
  /** A stale refresh generation was replayed — the family is revoked. */
  REFRESH_REUSED: 'Refresh token reuse detected; family revoked',
  /** A serialized grants payload could not be parsed into BigInt masks. */
  INVALID_GRANTS: 'Grants payload could not be parsed',
  /** `login()` was called with a name no method or provider owns. */
  UNKNOWN_STRATEGY:
    'No login method, strategy, or OAuth provider with that name',
  /** An OAuth config references an unknown provider preset. */
  UNKNOWN_PROVIDER: 'Unknown OAuth provider preset',
  /** The callback `state` does not match the expected value (CSRF guard). */
  OAUTH_STATE_MISMATCH: 'OAuth state mismatch',
  /** The authorization-code → token exchange failed. */
  OAUTH_EXCHANGE_FAILED: 'OAuth code exchange failed',
  /** The userinfo/profile fetch (or id_token decode) failed. */
  OAUTH_PROFILE_FAILED: 'OAuth profile fetch failed',
  /** An `id_token` failed verification — always fatal, never degraded. */
  OAUTH_IDTOKEN_INVALID: 'id_token failed verification',
  /** The provider's JWKS could not be obtained (`'REQUIRED'` policy). */
  OAUTH_JWKS_UNAVAILABLE: 'Provider JWKS could not be obtained',
};

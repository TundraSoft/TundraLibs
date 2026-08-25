/**
 * @fileoverview `@tundralibs/pact` — transport-agnostic authentication &
 * authorization toolkit: BigInt-bitmask authorization, hook-backed
 * identity/sessions (flat optional callbacks — the app owns storage),
 * five credential schemes, refresh-token rotation, TOTP, and an OAuth2/
 * OIDC client. Sub-paths: `./authz` (dependency-free authorization core),
 * `./oauth` (standalone client), `./types`, `./errors`.
 *
 * @module
 */

export { Pact } from './Pact.ts';
export { Permissions } from './Permissions.ts';
export { combineGrants, deserializeGrants, serializeGrants } from './grants.ts';
export {
  PactDefinitionError,
  PactDeniedError,
  PactError,
  type PactErrorCode,
  PactErrorCodes,
  type PactErrorMeta,
  PactOAuthError,
  PactTokenError,
} from './errors/mod.ts';
export type {
  PactAuthorizationUrlOptions,
  PactClaimSpec,
  PactClaimValue,
  PactCredential,
  PactEvents,
  PactGrants,
  PactHooks,
  PactLoginResult,
  PactModulePermissions,
  PactNewUser,
  PactOAuthCallbackParams,
  PactOAuthProfile,
  PactOAuthProviderConfig,
  PactOAuthProviderKind,
  PactOAuthTokens,
  PactOptions,
  PactPermissionBits,
  PactPermissionRef,
  PactPrincipal,
  PactSessionConfig,
  PactStoredApiKey,
  PactStoredSession,
  PactStoredToken,
  PactStoredUser,
  PactStrategy,
  PactStrategyResult,
  PactUserQuery,
} from './types/mod.ts';

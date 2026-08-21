/**
 * @fileoverview `@tundralibs/pact` — bitmask-based authentication &
 * authorization engine with pluggable data-fetch hooks.
 *
 * @module
 */

// ─── Facade ───────────────────────────────────────────────────────────
export { PACT } from './PACT.ts';
export type {
  LoginStrategy,
  PACTApiKey,
  PACTApiKeyOptions,
  PACTEvents,
  PACTKeyPair,
  PACTLoginOutcome,
  PACTLoginResult,
  PACTOptions,
  PACTPrincipal,
  PACTRevocationCheck,
} from './types/mod.ts';

// ─── OAuth (in-house auth-code + PKCE client) ─────────────────────────
export { IdTokenVerifier, OAuthClient } from './oauth/mod.ts';
export type {
  AuthorizationUrlOptions,
  CallbackParams,
  IdTokenContext,
  IdTokenVerificationPolicy,
  IdTokenVerifierOptions,
  OAuthProfile,
  OAuthProviderConfig,
  OAuthProviderKind,
  OAuthTokens,
} from './types/mod.ts';

// ─── Authorization core ──────────────────────────────────────────────
export { Permissions } from './Permissions.ts';
export { Groups } from './Groups.ts';
export { combineGrants, deserializeGrants, serializeGrants } from './grants.ts';
export type {
  GroupResolver,
  PACTGrants,
  PACTModulePermissions,
  PACTPermissionBits,
  PACTPermissionRef,
} from './types/mod.ts';

// ─── Errors ───────────────────────────────────────────────────────────
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

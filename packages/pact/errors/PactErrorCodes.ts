/**
 * @fileoverview Pact error code → message-template map. Call sites throw
 * `new PactError(code, context)`; templates use `${var}` placeholders
 * filled from the context at message-build time.
 *
 * @module
 */

/**
 * Error-code → template map. See per-entry comments for the variables
 * each template expects. Used by {@link PactError}.
 */
export const PactErrorCodes = {
  /**
   * An option failed validation.
   * Variables: option (option key), reason (why invalid)
   */
  INVALID_OPTION: "Invalid value for option '${option}': ${reason}",

  /**
   * A permission bit is zero or negative.
   * Variables: permission, bit
   */
  INVALID_BIT:
    "Permission '${permission}' has invalid bit ${bit} — bits must be positive",

  /**
   * A permission bit sets more than one bit.
   * Variables: permission, bit
   */
  COMPOSITE_BIT:
    "Permission '${permission}' must be a single bit, got ${bit} — combinations belong in grants, not in the definition",

  /**
   * Two permissions share the same bit, making them indistinguishable.
   * Variables: existing (first permission), permission (second), bit
   */
  DUPLICATE_BIT: "Permissions '${existing}' and '${permission}' share bit ${bit}",

  /**
   * A referenced permission is not in the bits catalog.
   * Variables: permission (+ module when referenced from modulePermissions)
   */
  UNKNOWN_PERMISSION:
    "Permission '${permission}' is not defined in this Pact instance",

  /**
   * A referenced module is not a key of modulePermissions.
   * Variables: module
   */
  UNKNOWN_MODULE: "Module '${module}' is not defined in this Pact instance",

  /**
   * The permission exists but is outside the module's declared ceiling.
   * Variables: permission, module
   */
  PERMISSION_NOT_IN_MODULE:
    "Permission '${permission}' is not allowed for module '${module}'",

  /**
   * The activeStatuses definition is malformed.
   * Variables: none
   */
  INVALID_STATUSES:
    'activeStatuses must be a non-empty list of non-empty strings',

  /**
   * Serialized grants failed to encode/decode.
   * Variables: reason
   */
  INVALID_GRANTS: 'Serialized grants are malformed: ${reason}',

  /**
   * Register found an existing user under the identifier.
   * Variables: identifier
   */
  USER_EXISTS: "A user with identifier '${identifier}' already exists",

  /**
   * Login failed: unknown identifier, password-less user, or wrong
   * password — deliberately collapsed (and variable-free) so account
   * existence never leaks.
   * Variables: none
   */
  INVALID_CREDENTIALS: 'Invalid credentials',

  /**
   * Credentials verified but the account's status is not in
   * activeStatuses. Only thrown AFTER a successful password check, so
   * it is not an enumeration oracle.
   * Variables: status, userId
   */
  NOT_ACTIVE: "Account is not active (status '${status}')",

  /**
   * An operation requires a hook that was not configured.
   * Variables: hook
   */
  MISSING_HOOK:
    "Hook '${hook}' is required for this operation but was not configured",

  /**
   * The principal does not hold the permission in the module (thrown by
   * `assert`; `can` returns false instead).
   * Variables: kind, principal (actor id), permission, module
   */
  PERMISSION_DENIED:
    "${kind} '${principal}' does not hold '${permission}' in module '${module}'",

  /**
   * The named OAuth instance is not configured.
   * Variables: provider (instance name)
   */
  UNKNOWN_PROVIDER: "OAuth instance '${provider}' is not configured",

  /**
   * The callback `state` did not match the expected value — fail-closed
   * CSRF guard.
   * Variables: provider
   */
  OAUTH_STATE_MISMATCH: "OAuth state mismatch for '${provider}'",

  /**
   * The authorization-code exchange failed (transport, non-2xx, or no
   * access token), or discovery produced an unusable endpoint.
   * Variables: provider, reason
   */
  OAUTH_EXCHANGE_FAILED:
    "OAuth code exchange failed for '${provider}': ${reason}",

  /**
   * The identity payload could not be obtained or carries no subject.
   * Variables: provider, reason
   */
  OAUTH_PROFILE_FAILED:
    "OAuth profile resolution failed for '${provider}': ${reason}",

  /**
   * The id_token failed signature or claim validation — always fatal,
   * under either policy.
   * Variables: provider, reason
   */
  OAUTH_IDTOKEN_INVALID:
    "OAuth id_token rejected for '${provider}': ${reason}",

  /**
   * The provider's key set could not be obtained and the instance's
   * idToken policy is 'REQUIRED'.
   * Variables: provider, reason
   */
  OAUTH_JWKS_UNAVAILABLE:
    "OAuth key set unavailable for '${provider}': ${reason}",

  /**
   * The verified identity is linked to no local user and the instance
   * has autoProvision off.
   * Variables: provider, subject
   */
  OAUTH_UNLINKED:
    "No user is linked to OAuth identity '${provider}:${subject}'",

  /**
   * Cacher rejected the cache configuration (unknown engine, bad engine
   * options, engine-type conflict on the shared instance name).
   * Variables: engine
   */
  CACHE_INIT_FAILED:
    "Failed to initialise the pact cache with engine '${engine}'",
} as const satisfies Record<string, string>;

/** Union of all keys from {@link PactErrorCodes}. */
export type PactErrorCode = keyof typeof PactErrorCodes;

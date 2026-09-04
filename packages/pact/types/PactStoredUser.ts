/**
 * The stored user record the application returns from `getUser` /
 * `createUser`. Storage-owned shape: pact reads it, gates on `status`
 * against the instance's activeStatuses, and resolves it to a principal
 * through a whitelist — credentials and any extra app fields never
 * survive resolution.
 */
export type PactStoredUser = {
  /** Stable user id — becomes the principal id. */
  readonly id: string;
  /** App-defined lifecycle status; only statuses in the instance's
   * activeStatuses may authenticate/authorize (fail-closed). */
  readonly status: string;
  /** pbkdf2 password hash; absent for password-less (e.g. OAuth-only)
   * users. */
  readonly passwordHash?: string;
  /** Serialized per-module grants (see `serializeGrants`). */
  readonly grants: string;
  /** App-owned bag, copied verbatim onto the resolved principal. */
  readonly metadata?: Readonly<Record<string, unknown>>;
};

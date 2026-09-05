/**
 * The stored API-key record. `secret` is RAW at the hook boundary: the
 * application ENCRYPTS it at rest (never hashes — the same secret must
 * serve both presentation and HMAC proof-of-possession) and decrypts
 * inside its hooks.
 */
export type PactStoredApiKey = {
  /** The key id — the actor id of an APIKEY principal. */
  readonly id: string;
  /** Owning user, when the key belongs to one. */
  readonly userId?: string;
  /** App-defined lifecycle status, gated like user status. */
  readonly status: string;
  /** Raw secret at this boundary; encrypt at rest, app-side. */
  readonly secret: string;
  /** Serialized per-module grants (see `serializeGrants`). */
  readonly grants: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

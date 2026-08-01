/**
 * @module
 *
 * Stable, machine-readable error codes for `@tundralibs/norm`. Every
 * typed norm error can carry one on its `context.code`, surfaced as
 * `error.code`, so callers branch on a symbol instead of parsing a
 * message string. Mirrors the drivers package's `EngineErrorCode`
 * union style (see `@tundralibs/drivers/errors/EngineErrorCodes.ts`).
 *
 * Codes are grouped by the surface that raises them. They are additive
 * — new codes may be appended; existing ones are never renamed or
 * repurposed once shipped.
 *
 * @since 1.0.0
 */

/** Union of every stable norm error code. Read it off a caught error
 * as `error.code` (present when the throw-site set one). */
export type NormErrorCode =
  // ── Query surface ({@link NormQueryError}) ─────────────────────────
  /** The requested entity key is not registered. */
  | 'UNKNOWN_ENTITY'
  /** A filter / orderBy / aggregate referenced a column that cannot be
   * filtered (explicit `unfilterable()` or implied by `encrypt()`), or
   * a hashed column was filtered with an unsupported value/operator. */
  | 'NON_FILTERABLE_COLUMN'
  /** An aggregate request is malformed or combined with an
   * incompatible option (relations, masks, total, encrypted column). */
  | 'AGGREGATE_MISUSE'
  /** An upsert `conflictKeys` / `updateOnConflict` entry is invalid —
   * an encrypted (nondeterministic) key, a virtual mask, or a batch
   * that cannot keep a hash sibling in sync. */
  | 'UPSERT_CONFLICT_KEY'
  /** A `db.scope(...)` spec is invalid, or a scoped write would move a
   * row out of its scope. */
  | 'SCOPE_VIOLATION'
  /** A projection is malformed — a bad key, a sub-projection on a
   * non-relation, an unknown target, or a relation-only projection. */
  | 'INVALID_PROJECTION'
  /** A relation alias in a filter/orderBy/projection resolves to
   * neither a foreign key nor a reverse relation. */
  | 'UNKNOWN_RELATION'
  // ── Crypto surface ({@link NormCryptoError}) ───────────────────────
  /** Encryption / decryption was requested but no `secret` was
   * supplied to `new Norm({ secret })`. */
  | 'MISSING_SECRET'
  // ── Instance / configuration ({@link NormError}) ───────────────────
  /** A value passed where a `NormDb` handle was expected is not one
   * (e.g. `runtimeOf()` / the migration seam). */
  | 'INVALID_HANDLE'
  /** `new Norm({...})` engine/database configuration is invalid. */
  | 'INVALID_ENGINE_CONFIG'
  // ── Definition / registry ({@link NormDefinitionError}) ────────────
  /** Two registry keys map to the same database object, or a key is
   * provided by more than one composed schema. */
  | 'DUPLICATE_ENTITY'
  /** A foreign key references an entity key that is not registered. */
  | 'UNRESOLVED_FK'
  /** A foreign key is structurally invalid — missing target column, or
   * a join over an encrypted column. */
  | 'INVALID_FK'
  /** A derived reverse-relation name collides with a column, a foreign-key
   * alias, or another reverse on the target entity. */
  | 'REVERSE_COLLISION'
  /** A stored SELECT reads from, or a foreign key targets, a terminal
   * QUERY entity (QUERYs cannot be joined or built upon). */
  | 'TERMINAL_JOIN'
  // ── Migrations ({@link NormMigrationError}) ────────────────────────
  /** The applied head no longer matches its recorded snapshot hash —
   * the definitions or the snapshot file drifted after apply. */
  | 'DRIFT'
  /** `apply()` would DROP a table/column without `allowDrop`. */
  | 'BLOCKED_DROPS'
  /** A stored plan artifact's hash no longer matches the plan `apply()`
   * would execute. */
  | 'PLAN_HASH_MISMATCH'
  /** A version left a partial-apply checkpoint (engines without
   * transactional DDL), but its plan has changed since — resuming would
   * skip the wrong statements. */
  | 'PLAN_CHANGED'
  /** A reviewed `.sql` plan artifact is missing. */
  | 'MISSING_ARTIFACT'
  /** A versioned snapshot file is missing or unreadable. */
  | 'MISSING_SNAPSHOT'
  /** A migration lock (file or server-side advisory) could not be
   * acquired within the timeout. */
  | 'LOCK_TIMEOUT'
  /** A rollback target is not below the applied head. */
  | 'INVALID_ROLLBACK'
  /** A one-way digest column's algorithm changed — there is no
   * plaintext to re-digest, so it cannot be migrated in place. */
  | 'DIGEST_IMMUTABLE'
  /** A table rebuild copied a different row count than the original. */
  | 'REBUILD_COUNT_MISMATCH'
  /** An unsupported rename was requested (e.g. `renamedFrom` on a
   * VIEW). */
  | 'UNSUPPORTED_RENAME';

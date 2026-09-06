/**
 * The unified authorized actor pact evaluates permissions against — a
 * resolved user or API key. Plain readonly data: serializable, cacheable,
 * and transport-agnostic; evaluation lives on the Pact instance
 * (`can`/`assert`).
 *
 * A principal carries ONLY id/kind/grants/metadata. Never credentials or
 * profile fields (those stay on the stored record, behind the resolution
 * whitelist), and no status — a principal exists iff its source was
 * ACTIVE at resolution time. Grants are PER-MODULE effective masks; a
 * module missing from the map holds no permissions there (fail-closed).
 */
export type PactPrincipal<M extends string = string> =
  | {
    /** A resolved user. */
    readonly kind: 'USER';
    /** The user's stable id. */
    readonly id: string;
    /** Module → effective permission mask; a missing module means no
     * access in it. */
    readonly grants: Readonly<Partial<Record<M, bigint>>>;
    /** App-owned bag, copied verbatim from the stored record. */
    readonly metadata?: Readonly<Record<string, unknown>>;
  }
  | {
    /** A resolved API key — the key IS the actor. */
    readonly kind: 'APIKEY';
    /** The key's own id. */
    readonly id: string;
    /** Owning user, when the key belongs to one. */
    readonly userId?: string;
    /** Module → effective permission mask; a missing module means no
     * access in it. */
    readonly grants: Readonly<Partial<Record<M, bigint>>>;
    /** App-owned bag, copied verbatim from the stored record. */
    readonly metadata?: Readonly<Record<string, unknown>>;
  };

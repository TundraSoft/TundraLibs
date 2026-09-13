/**
 * @module
 *
 * Guardian-style column builders — `Column.varchar(255).encrypt().hash()`.
 *
 * A builder is immutable sugar: every chained call returns a NEW
 * builder, and the result of a chain is carried as `spec` — a PLAIN
 * serializable object (what migrations/snapshots will consume). The
 * TypeScript value type rides along as a phantom generic, so row /
 * insert shapes are derived by reading the builder's type instead of
 * decoding raw literals (no `as const` discipline, no literal-widening
 * pitfalls).
 *
 * Correct-by-construction beats validation-after-the-fact: `hash()`
 * (the lookup sibling) exists only on encrypted builders, `.guard()`
 * is pinned to the column's own concrete Guardian class (a string
 * column can't be guarded by a `NumberGuardian`), and digest columns
 * (`Column.hash('SHA-256')`) expose no `encrypt()` — invalid
 * combinations simply don't type-check here.
 *
 * `encrypt()` exists on EVERY value kind — string, number, bigint,
 * date, boolean, json. The logical TS type is unchanged (a
 * `Column.timestamp().encrypt()` still reads/writes `Date`); the
 * runtime canonicalizes the plaintext to a string before encrypting
 * and decodes it back on read, and migrations project the PHYSICAL
 * column to TEXT.
 *
 * Chain-order rule: `encrypt()` narrows the surface to the encrypted
 * builder, so `.guard()` must come BEFORE `encrypt()` — it runs against
 * the plaintext. Everything else (`nullable` / `default` / `comment` /
 * `hidden` / `beforeWrite` / …) preserves the builder kind — and the
 * `.hidden()` brand — and chains anywhere.
 *
 * `.guard(g)` takes an ALREADY-BUILT Guardian and makes it the column's
 * real runtime validator — transforms and validators run in whatever
 * order the caller composed them, once, as one expression:
 *
 * ```ts
 * const email = Column.varchar(255)
 *   .guard(Guardian.string().trim().toLowerCase().email());
 * ```
 *
 * `Column.enum(values)` is the narrowing counterpart (`.lov()`'s
 * replacement) — it infers the TS union from the values themselves, no
 * `as const` needed:
 *
 * ```ts
 * const status = Column.enum(['active', 'banned']);
 * // TS type: 'active' | 'banned'
 * ```
 *
 * @since 1.0.0
 */

import { cuid, cuid2, nanoID, ObjectID, simpleID, ulid } from '@tundralibs/id';
import { Guardian } from '@tundralibs/guardian';
import type {
  BaseGuardian,
  BigIntGuardian,
  BooleanGuardian,
  DateGuardian,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian as StringGuard,
  UnknownGuardian,
} from '@tundralibs/guardian';
import type { HashAlgorithm } from '../crypto.ts';

/** Digest algorithms a `Column.hash()` column may declare — the SAME
 * set as {@link HashAlgorithm} (the canonical union). Encrypt SIBLINGS
 * are pinned to SHA-256 and take no algorithm. */
export type DigestAlgorithm = HashAlgorithm | 'PBKDF2';

/** Hex-digest length per algorithm — drives the physical VARCHAR. The
 * SHA-* families are fixed-width hex; `PBKDF2` is a self-describing salted
 * string (`pbkdf2-<hash>$<iters>$<salt>$<hash>`) that fits well under 255. */
export const DIGEST_LENGTHS: Readonly<Record<DigestAlgorithm, number>> = {
  'SHA-256': 64,
  'SHA-384': 96,
  'SHA-512': 128,
  'PBKDF2': 255,
};

/** DB-evaluated expression marker (e.g. `{ $$_expression: 'NOW' }`).
 * Passed through to the OQL data slot untouched; never validated as a
 * JS value. */
export type ExpressionDefault = {
  readonly $$_expression: string;
  readonly args?: unknown;
};

/**
 * A column default: literal, per-row LOCAL generator (a plain JS
 * function called per write), or DB-side expression. Both `default()`
 * (insert) and `defaultOnUpdate()` accept all three forms.
 */
export type DefaultInput<T> = T | (() => T) | ExpressionDefault;

/** Resolves a column's TS value type to the concrete Guardian class the
 * runtime actually dispatches to (mirrors `guardians.ts`'s `buildBase`
 * dispatch table) — the type `.guard()` pins its parameter to. */
type ConcreteGuardianOf<T> = T extends boolean ? BooleanGuardian
  : T extends bigint ? BigIntGuardian
  : T extends number ? NumberGuardian
  : T extends Date ? DateGuardian
  : T extends string ? StringGuard
  : T extends Uint8Array ? UnknownGuardian<Uint8Array>
  : UnknownGuardian<T>;

/**
 * The plain data a builder emits — one column of a table/view
 * definition. Serializable except for the transform/default callbacks
 * and `guard` (the snapshot layer strips those, as before) — the
 * value-level rules live inside `guard`'s own Guardian instance, not
 * on the spec.
 *
 * `$type` is a phantom: never assigned at runtime, it carries the
 * column's TS value type (including `| null` when nullable) for the
 * derivation types. `$insertOptional` marks columns an insert payload
 * may omit (a declared insert default).
 */
export interface ColumnSpec<
  T = unknown,
  Opt extends boolean = boolean,
> {
  /** Logical SQL type the factory emitted (`'VARCHAR'`, `'JSONB'`, …).
   * Each dialect renders it to its own spelling. */
  readonly type: string;
  /** Declared width for the sized string/binary types. */
  readonly length?: number;
  /** Total digits, for `DECIMAL` / `NUMERIC`. */
  readonly precision?: number;
  /** Digits after the point, for `DECIMAL` / `NUMERIC`. */
  readonly scale?: number;
  /** Accepts NULL — which also makes the column omittable on insert. */
  readonly nullable?: true;
  /** Encrypted at rest; the PHYSICAL column becomes TEXT regardless of
   * `type`, and the column is not filterable on its own. */
  readonly encrypt?: true;
  /** A deterministic `<name>_hash` sibling is maintained on write, so
   * plaintext equality filters can rewrite to an indexed digest
   * lookup. Only meaningful alongside `encrypt`. */
  readonly hash?: true;
  /** One-way DIGEST column (`Column.hash(algo)`): plaintext in, digest
   * at rest, equality filters rewrite through the same digest. The
   * algorithm is definition-level data — the physical VARCHAR length
   * derives from it (64/96/128 hex chars). */
  readonly hashed?: DigestAlgorithm;
  /** `false` = excluded from default projections (RETURNING included). */
  readonly project?: false;
  /** `false` = rejected in WHERE / ORDER BY. */
  readonly filterable?: false;
  /** Rejected in insert payloads (set on computed columns like masks). */
  readonly disableInsert?: true;
  /** Rejected in update payloads. */
  readonly disableUpdate?: true;
  /** Documentation + DDL comment (`COMMENT ON COLUMN …`). */
  readonly comment?: string;
  /** Canonicalized defaults per slot: `insert` fires when the payload
   * omits the column, `update` on every update. Bigints and Dates are
   * stored as strings; generators and DB expressions pass through. */
  readonly default?: {
    readonly insert?: unknown;
    readonly update?: unknown;
  };
  /** Value hooks. Not serializable — the snapshot layer strips them,
   * so they never participate in migration diffs. */
  readonly transforms?: {
    readonly beforeWrite?: (v: never) => unknown;
    readonly afterRead?: (v: never) => unknown;
  };
  /** MIGRATION HINT: the column's PREVIOUS name — consumed only by
   * the migration diff (rename instead of drop+add); inert everywhere
   * else and excluded from snapshot hashes. */
  readonly renamedFrom?: string;
  /** VIRTUAL masked column (`Column.mask(source, fn)`): computed
   * client-side from `source` after decrypt/afterRead. Never stored,
   * never in DDL/snapshots; excluded from writes and filters. */
  readonly masked?: {
    readonly source: string;
    readonly fn: (v: never) => string;
  };
  /** Real per-key JSON validation, set only by `Column.json(schema)`'s
   * schema-accepting overload — the one place `Shape` and its runtime
   * validation are the SAME source of truth, rather than the bare
   * `Column.json<Shape>()` phantom. Not serializable — excluded from
   * snapshot/docs exactly like `masked`/`transforms`. */
  readonly jsonSchema?: ObjectGuardian<Record<string, unknown>>;
  /** The column's real runtime validator, set by `.guard(g)` — an
   * already-built Guardian, transforms and validators composed in
   * whatever order the caller chose. Not serializable — excluded from
   * snapshot/docs exactly like `masked`/`jsonSchema`. */
  readonly guard?: BaseGuardian<unknown>;
  /** @internal Phantom — TS value type. Never set at runtime. */
  readonly $type?: T;
  /** @internal Phantom — insert payload may omit this column. */
  readonly $insertOptional?: Opt;
}

/** Any column builder, erased — what `Entity()` accepts. */
// deno-lint-ignore no-explicit-any
export type AnyColumnBuilder = ColumnBuilder<any, boolean>;

/** The `.hidden()` type brand. */
type _HiddenBrand = { readonly spec: { readonly project: false } };

/**
 * Preserve the `.hidden()` brand across generic-CHANGING modifiers
 * (`nullable` / `default` / `lov` / `encrypt` / `hash` return fresh
 * builder kinds, which would otherwise silently drop the brand while
 * the runtime spec keeps stripping the column — a type/runtime
 * divergence).
 */
type _KeepHidden<Self, B> = Self extends _HiddenBrand ? B & _HiddenBrand : B;

/** Is `v` an OQL expression marker (DB-evaluated default)? The ONE
 * canonical predicate — guardians / asserts / docs all import THIS
 * instead of re-declaring it. */
export function isExpressionValue(v: unknown): v is ExpressionDefault {
  return typeof v === 'object' && v !== null && '$$_expression' in v;
}

/** Canonicalize a default for storage: bigint → string, Date → ISO
 * string; functions and DB expressions pass through untouched. */
function storeDefault(v: unknown): unknown {
  if (typeof v === 'function' || isExpressionValue(v)) return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

/**
 * Base builder. Generic state:
 * - `T`   — TS value type (already includes `| null` when nullable).
 * - `Opt` — insert payload may omit it (nullable or defaulted).
 *
 * Subclasses (string / number / date) OVERRIDE `nullable()` and
 * `default()` to return their own kind, so `.encrypt().nullable()`
 * keeps the encrypted surface and `.hash().nullable()` keeps the hash
 * branding — the chain never silently decays to the base builder.
 *
 * Primary keys are NOT a column concern — `Entity()` takes the key
 * tuple in its options.
 */
export class ColumnBuilder<
  T,
  Opt extends boolean = false,
> {
  /** The emitted plain column data. */
  public readonly spec: ColumnSpec<T, Opt>;

  /**
   * Wraps a spec directly. Prefer the {@linkcode Column} factories —
   * this is the seam the chain methods use to produce each new builder.
   */
  constructor(spec: ColumnSpec<T, Opt>) {
    this.spec = spec;
  }

  /** @internal Chain helper — new spec with `patch` merged. */
  protected _with<T2 = T, O2 extends boolean = Opt>(
    patch: Record<string, unknown>,
  ): ColumnSpec<T2, O2> {
    return { ...this.spec, ...patch } as ColumnSpec<T2, O2>;
  }

  /**
   * @internal Same-shape chain helper: constructs THIS builder's
   * actual class (subclasses survive the chain) and keeps the
   * declared `this` type — so `.hash().beforeWrite(...)` keeps the
   * hash branding instead of decaying to the base builder.
   */
  protected _clone(patch: Record<string, unknown>): this {
    const Ctor = this.constructor as new (spec: ColumnSpec<T, Opt>) => this;
    return new Ctor(this._with(patch));
  }

  /** Column accepts NULL. Also makes it omittable on insert. */
  public nullable(): _KeepHidden<this, ColumnBuilder<T | null, true>> {
    return new ColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, ColumnBuilder<T | null, true>>;
  }

  /**
   * Insert default — fires when the payload OMITS the column (or
   * passes explicit `undefined`); explicit `null` is validated as a
   * value. Literal used as-is, local generator (`() => v`) called per
   * row by the generated Guardian, expression evaluated by the
   * database. Makes the column omittable on insert.
   */
  public default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, ColumnBuilder<T, true>> {
    return new ColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, ColumnBuilder<T, true>>;
  }

  /**
   * Update default — auto-touch on every update (e.g. `updatedAt`).
   * Same three forms as `default()`: literal, local generator, or DB
   * expression.
   */
  public defaultOnUpdate(v: DefaultInput<NonNullable<T>>): this {
    return this._clone({
      default: { ...this.spec.default, update: storeDefault(v) },
    });
  }

  /** Documentation + DDL comment for this column. */
  public comment(text: string): this {
    return this._clone({ comment: text });
  }

  /** Exclude from default projections (explicit opt-in still works).
   * Branded at the type level so `ReadRowOf` drops the column from
   * default-read shapes while Insert/Update keep it writable. */
  public hidden(): this & _HiddenBrand {
    return this._clone({ project: false }) as this & _HiddenBrand;
  }

  /** Reject in WHERE / ORDER BY. */
  public unfilterable(): this {
    return this._clone({ filterable: false });
  }

  /** MIGRATION HINT: this column's PREVIOUS name. Consumed only by
   * the migration diff — the rename emits `RENAME COLUMN` instead of
   * a data-losing drop+add. Delete the hint once applied everywhere. */
  public renamedFrom(oldName: string): this {
    return this._clone({ renamedFrom: oldName });
  }

  /** Normalize before the value is validated/encrypted/written. */
  public beforeWrite(fn: (v: NonNullable<T>) => NonNullable<T>): this {
    return this._clone({
      transforms: { ...this.spec.transforms, beforeWrite: fn },
    });
  }

  /** Transform as the value comes back from a read. */
  public afterRead(fn: (v: NonNullable<T>) => NonNullable<T>): this {
    return this._clone({
      transforms: { ...this.spec.transforms, afterRead: fn },
    });
  }

  /**
   * Make an already-built Guardian the column's real runtime validator
   * — transforms (`.trim()`, `.toLowerCase()`, …) and validators
   * (`.minLength()`, `.pattern()`, `.email()`, …) run in whatever order
   * YOU composed them, once, as one expression:
   *
   * ```ts
   * Column.varchar(255).guard(Guardian.string().trim().toLowerCase().email());
   * ```
   *
   * `g`'s type is pinned to `T`'s OWN concrete guardian class
   * (`StringGuardian` for a string column, `NumberGuardian`/
   * `BigIntGuardian` for number/bigint, `DateGuardian` for a date,
   * `BooleanGuardian` for a boolean, `UnknownGuardian<T>` otherwise) —
   * never the generic `BaseGuardian<T>`. Some of these classes also
   * carry methods that change the value's TYPE (`NumberGuardian
   * .toBigInt()`, `DateGuardian.toISOString()`, `BigIntGuardian
   * .toHex()`, `BooleanGuardian.toNumber()`, …); pinning the signature
   * this way means a chain ending in one of those simply fails to
   * type-check, rather than silently swapping the column's declared
   * type.
   *
   * One-shot: call it once with everything composed — calling it twice
   * throws. Nullability/defaults stay column-only — a guard that
   * already declared `.nullable()`/`.optional()` is rejected; declare
   * those with `.nullable()`/`.default()` here instead. Async guardians
   * are rejected too — norm validates synchronously.
   *
   * @throws {@link Error} If called twice, if `g` is already nullable/
   *   optional, or if `g` has an async validation step.
   */
  public guard(g: ConcreteGuardianOf<NonNullable<T>>): this {
    if (this.spec.guard !== undefined) {
      throw new Error(
        'guard(): already set — compose everything into one Guardian ' +
          'before calling guard() once.',
      );
    }
    const meta = (g as {
      metaData?: {
        isAsync?: boolean;
        isNullable?: boolean;
        isOptional?: boolean;
      };
    })
      .metaData;
    if (meta?.isAsync === true) {
      throw new Error(
        'guard(): norm validates synchronously — an async refine()/' +
          'process() step is not supported.',
      );
    }
    if (meta?.isNullable === true || meta?.isOptional === true) {
      throw new Error(
        'guard(): declare nullable()/default() on the column, not on ' +
          'the guard.',
      );
    }
    return this._clone({ guard: g as never });
  }

  /**
   * Encrypt at rest (AES via the Norm secret). Available on every
   * value kind: non-string plaintext is canonicalized to a string
   * before encryption (Date → ISO-8601, number/bigint → decimal
   * string, json → JSON text) and decoded back on read, so the TS
   * type is unchanged while the PHYSICAL column becomes TEXT.
   * Implies the column is not filterable — random-IV ciphertext never
   * matches an equality predicate (chain `.hash()` for lookups).
   * Validators constrain the plaintext, so they must chain BEFORE.
   */
  public encrypt(): _KeepHidden<this, EncryptedColumnBuilder<T, Opt>> {
    return new EncryptedColumnBuilder<T, Opt>(
      this._with({ encrypt: true }),
    ) as _KeepHidden<this, EncryptedColumnBuilder<T, Opt>>;
  }
}

/**
 * String-kind builder — keeps `T extends string` through the chain, so
 * `.guard()` (inherited from {@linkcode ColumnBuilder}) stays pinned to
 * `StringGuardian` and must precede `encrypt()` (it constrains the
 * PLAINTEXT).
 */
export class StringColumnBuilder<
  T extends string | null = string,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** As {@linkcode ColumnBuilder.nullable}, keeping the string surface
   * so `.guard()` stays pinned to `StringGuardian`. */
  public override nullable(): _KeepHidden<
    this,
    StringColumnBuilder<T | null, true>
  > {
    return new StringColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, StringColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}, keeping the string surface. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, StringColumnBuilder<T, true>> {
    return new StringColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, StringColumnBuilder<T, true>>;
  }
}

/**
 * Encrypted builder (any value kind) — the only place `hash()`
 * exists. Validators are gone from this surface by design: they
 * constrain the PLAINTEXT and must chain before `encrypt()`.
 */
export class EncryptedColumnBuilder<
  T = string,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** Already encrypted — chaining `encrypt()` twice is a bug. */
  public override encrypt(): never {
    throw new Error('encrypt(): column is already encrypted.');
  }

  /** As {@linkcode ColumnBuilder.nullable}, keeping the encrypted
   * surface so `.hash()` stays reachable. */
  public override nullable(): _KeepHidden<
    this,
    EncryptedColumnBuilder<T | null, true>
  > {
    return new EncryptedColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, EncryptedColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}. The value is declared as
   * PLAINTEXT — encryption happens on the way to the database. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, EncryptedColumnBuilder<T, true>> {
    return new EncryptedColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, EncryptedColumnBuilder<T, true>>;
  }

  /**
   * Synthesize a deterministic `<name>_hash` sibling column
   * (maintained on every write) so plaintext equality filters rewrite
   * to an indexed digest lookup. Sibling digests are PINNED to
   * SHA-256 (system-controlled; VARCHAR(64)) — for a caller-facing
   * digest column with a declared algorithm use `Column.hash(algo)`.
   */
  public hash(): _KeepHidden<this, HashedColumnBuilder<T, Opt>> {
    return new HashedColumnBuilder<T, Opt>(
      this._with({ hash: true }),
    ) as _KeepHidden<this, HashedColumnBuilder<T, Opt>>;
  }
}

/**
 * An encrypted builder whose spec is BRANDED `hash: true` at the type
 * level — `Entity()` reads this to synthesise the `<name>_hash`
 * sibling in the definition's column type. A real class (not an
 * intersection alias) so `nullable()` / `default()` / `this`-typed
 * modifiers all keep the branding.
 */
export class HashedColumnBuilder<
  T = string,
  Opt extends boolean = false,
> extends EncryptedColumnBuilder<T, Opt> {
  /** Narrowed so `hash: true` is visible at the type level — that is
   * what drives the sibling column's synthesis in `Entity()`. */
  declare readonly spec: ColumnSpec<T, Opt> & { readonly hash: true };

  /** The class IS the brand — enforce it, so a directly-constructed
   * instance can never carry a spec whose runtime `hash` is unset
   * (the type-level sibling synthesis keys off this invariant). */
  constructor(spec: ColumnSpec<T, Opt>) {
    super(
      (spec.hash === true ? spec : { ...spec, hash: true }) as ColumnSpec<
        T,
        Opt
      >,
    );
  }

  /** As {@linkcode ColumnBuilder.nullable}, preserving the `hash`
   * brand so the sibling is still synthesized. */
  public override nullable(): _KeepHidden<
    this,
    HashedColumnBuilder<T | null, true>
  > {
    return new HashedColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, HashedColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}, preserving the `hash` brand. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, HashedColumnBuilder<T, true>> {
    return new HashedColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, HashedColumnBuilder<T, true>>;
  }
}

/** Numeric builder — keeps `T extends number | bigint` through the
 * chain, so `.guard()` (inherited) stays pinned to `NumberGuardian`/
 * `BigIntGuardian`. */
export class NumberColumnBuilder<
  T extends number | bigint | null = number,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** As {@linkcode ColumnBuilder.nullable}, keeping the numeric surface. */
  public override nullable(): _KeepHidden<
    this,
    NumberColumnBuilder<T | null, true>
  > {
    return new NumberColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, NumberColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}, keeping the numeric surface. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, NumberColumnBuilder<T, true>> {
    return new NumberColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, NumberColumnBuilder<T, true>>;
  }
}

/** Date/timestamp builder — keeps `T extends Date` through the chain,
 * so `.guard()` (inherited) stays pinned to `DateGuardian`. */
export class DateColumnBuilder<
  T extends Date | null = Date,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** As {@linkcode ColumnBuilder.nullable}, keeping the date surface. */
  public override nullable(): _KeepHidden<
    this,
    DateColumnBuilder<T | null, true>
  > {
    return new DateColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, DateColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}, keeping the date surface.
   * A literal `Date` is canonicalized to an ISO string in the spec. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, DateColumnBuilder<T, true>> {
    return new DateColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, DateColumnBuilder<T, true>>;
  }
}

/**
 * One-way DIGEST column (`Column.hash('SHA-256')`) — for values like
 * passwords that must be comparable but never readable. Callers write
 * and filter by PLAINTEXT; the runtime digests on the way in and the
 * column stores only the hex digest (its physical VARCHAR length is
 * derived from the algorithm). Reads return the digest — there is
 * nothing to decrypt, so `encrypt()` is a hard error here.
 *
 * `.guard()` (inherited, pinned to `StringGuardian`) constrains the
 * PLAINTEXT (password policy), not the digest.
 */
export class DigestColumnBuilder<
  T extends string | null = string,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** As {@linkcode ColumnBuilder.nullable}, keeping the digest surface
   * (and `.guard()`'s `StringGuardian` pinning) chainable. */
  public override nullable(): _KeepHidden<
    this,
    DigestColumnBuilder<T | null, true>
  > {
    return new DigestColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, DigestColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}. The value is declared as
   * PLAINTEXT — it is digested on the way to the database. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, DigestColumnBuilder<T, true>> {
    return new DigestColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, DigestColumnBuilder<T, true>>;
  }

  /** A digest is already one-way — encrypting it is a bug. */
  public override encrypt(): never {
    throw new Error(
      'encrypt(): digest columns (Column.hash) are one-way already.',
    );
  }
}

/**
 * VIRTUAL masked column — presentation of a sibling `source` column
 * (`cardDisplay: Column.mask('card', v => '****' + v.slice(-4))`).
 * Its own first-class key: custom name IS the key, several masks may
 * share one source, and whether the RAW projects by default stays the
 * source's independent `.hidden()` decision.
 *
 * Reads and RETURNING carry the computed value (the source is fetched
 * — and decrypted — even when hidden, then stripped). Never stored:
 * excluded from DDL, snapshots, migrations, writes, filters and
 * ordering. Only `hidden()` / `comment()` / `nullable()` chain —
 * declare `.nullable()` when the SOURCE is nullable (null source →
 * null mask; like the fn's parameter type, this is annotation on
 * trust: TS cannot see sibling properties of the same object
 * literal).
 */
export class MaskColumnBuilder<
  T extends string | null = string,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** Narrowed so the write-exclusion and the `masked` brand are
   * visible at the type level, not just at runtime. */
  declare readonly spec: ColumnSpec<T, Opt> & {
    readonly disableInsert: true;
    readonly disableUpdate: true;
    /** Type brand — lets projection/filter types exclude masks. */
    readonly masked: { readonly source: string };
  };

  /** Declare the mask nullable when its SOURCE is nullable — a null
   * source yields a null mask. TS cannot infer this, so it is
   * annotation on trust. */
  public override nullable(): _KeepHidden<
    this,
    MaskColumnBuilder<T | null, true>
  > {
    return new MaskColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, MaskColumnBuilder<T | null, true>>;
  }

  /** Unavailable — a mask is computed from its source.
   * @throws {@link Error} Always. */
  public override default(): never {
    throw new Error('mask columns are computed — no defaults.');
  }
  /** Unavailable — a mask is computed from its source.
   * @throws {@link Error} Always. */
  public override defaultOnUpdate(): never {
    throw new Error('mask columns are computed — no defaults.');
  }
  /** Unavailable — a mask is never written.
   * @throws {@link Error} Always. */
  public override beforeWrite(): never {
    throw new Error('mask columns are never written.');
  }
  /** Unavailable — the mask fn already IS the read transform.
   * @throws {@link Error} Always. */
  public override afterRead(): never {
    throw new Error(
      'mask columns ARE the read transform — put logic in the mask fn.',
    );
  }
  /** Unavailable — a mask is presentation over an already-decrypted
   * source, and is never stored.
   * @throws {@link Error} Always. */
  public override encrypt(): never {
    throw new Error('mask columns are presentation — nothing to encrypt.');
  }
}

/**
 * JSON/JSONB builder produced when `Column.json(schema)` is given a
 * `Guardian.object({...})` — the one column kind whose declared TS
 * `Shape` and runtime validation are the SAME source of truth, instead
 * of the bare `Column.json<Shape>()` phantom (see {@linkcode Column.json}).
 */
export class JsonColumnBuilder<
  T extends Record<string, unknown> | null = Record<string, unknown>,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** As {@linkcode ColumnBuilder.nullable}, keeping the schema-backed
   * surface chainable. */
  public override nullable(): _KeepHidden<
    this,
    JsonColumnBuilder<T | null, true>
  > {
    return new JsonColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, JsonColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}, keeping the schema-backed surface. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, JsonColumnBuilder<T, true>> {
    return new JsonColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, JsonColumnBuilder<T, true>>;
  }

  /**
   * Unavailable here — unlike every other column kind, a JSON schema
   * is already a full, directly configurable {@link ObjectGuardian}
   * BEFORE it reaches `Column.json(schema)`: call `.strict()` /
   * `.passthrough()` / `.catchall()` / `.refine()` on the schema
   * itself (`Guardian.object({...}).strict()`), not through `.guard()`
   * here. The base `ColumnBuilder.guard()`'s type (`UnknownGuardian<T>`)
   * would not match this column's REAL runtime guardian (the schema
   * instance itself) — kept a hard error rather than a silently wrong
   * type.
   * @throws {@link Error} Always.
   */
  public override guard(): never {
    throw new Error(
      "Column.json(schema)'s Guardian is already yours to configure — " +
        'chain .strict()/.passthrough()/.catchall()/.refine() on the ' +
        'schema itself before passing it to Column.json(), not here.',
    );
  }
}

/**
 * Builder produced by `Column.enum(values)` — the narrowing counterpart
 * of the removed `.lov()`: `values` becomes both the column's runtime
 * validator (a `Guardian.enum(values)`) and its narrowed TS type, no
 * `as const` needed.
 */
export class EnumColumnBuilder<
  T extends string | number | bigint | null = string,
  Opt extends boolean = false,
> extends ColumnBuilder<T, Opt> {
  /** As {@linkcode ColumnBuilder.nullable}, keeping the narrowed surface. */
  public override nullable(): _KeepHidden<
    this,
    EnumColumnBuilder<T | null, true>
  > {
    return new EnumColumnBuilder<T | null, true>(
      this._with<T | null, true>({ nullable: true }),
    ) as _KeepHidden<this, EnumColumnBuilder<T | null, true>>;
  }

  /** As {@linkcode ColumnBuilder.default}, keeping the narrowed surface. */
  public override default(
    v: DefaultInput<NonNullable<T>>,
  ): _KeepHidden<this, EnumColumnBuilder<T, true>> {
    return new EnumColumnBuilder<T, true>(this._with<T, true>({
      default: { ...this.spec.default, insert: storeDefault(v) },
    })) as _KeepHidden<this, EnumColumnBuilder<T, true>>;
  }

  /**
   * Unavailable — the column's real runtime guardian is already the
   * `Guardian.enum(values)` built for you from what you passed to
   * `Column.enum()`; `ConcreteGuardianOf<T>` would resolve to
   * `StringGuard`/`NumberGuardian`/`BigIntGuardian`, which does not
   * match it. For custom `EnumGuardian` behaviour (`.caseInsensitive()`,
   * `.exclude()`, …), drop to `Column.varchar(n).guard(Guardian
   * .enum([...]).caseInsensitive())` instead — validated, just not
   * TS-narrowed.
   * @throws {@link Error} Always.
   */
  public override guard(): never {
    throw new Error(
      "Column.enum(values)'s Guardian is generated from the values you " +
        'passed — there is nothing to add via guard() here. For ' +
        'EnumGuardian methods like .caseInsensitive(), use ' +
        'Column.varchar(n).guard(Guardian.enum([...]).caseInsensitive()) ' +
        'instead (validated, not TS-narrowed).',
    );
  }
}

/** Physical name of the synthesized digest sibling of an
 * `.encrypt().hash()` column — THE single spelling of the rule. */
export function hashSiblingOf(column: string): string {
  return `${column}_hash`;
}

/** Inverse of {@linkcode hashSiblingOf}: the candidate source column
 * of a `_hash`-suffixed name, or null when the name has no suffix.
 * Callers must still confirm `hash: true` on the returned source —
 * user columns may legally end in `_hash` only when no encrypted
 * source claims them. */
export function hashSourceOf(sibling: string): string | null {
  return sibling.endsWith('_hash') ? sibling.slice(0, -'_hash'.length) : null;
}

/** `Column.json<Shape>()` — phantom-only, no schema given. */
function columnJson<Shape extends Record<string, unknown>>(): ColumnBuilder<
  Shape
>;
/** `Column.json(Guardian.object({...}))` — `Shape` INFERRED from the
 * schema's own output type, which becomes the column's real runtime
 * validator. */
function columnJson<
  TIn extends Record<string, unknown>,
  TOut extends Record<string, unknown> = TIn,
>(schema: ObjectGuardian<TIn, TOut>): JsonColumnBuilder<TOut>;
function columnJson(
  schema?: ObjectGuardian<Record<string, unknown>, Record<string, unknown>>,
): unknown {
  return schema !== undefined
    ? new JsonColumnBuilder({ type: 'JSONB', jsonSchema: schema })
    : new ColumnBuilder({ type: 'JSONB' });
}

/** `Column.enum(['active', 'banned'])` — VARCHAR, width = longest value. */
function columnEnum<const V extends readonly string[]>(
  values: V,
): EnumColumnBuilder<V[number]>;
/** `Column.enum([1, 2, 3])` — INTEGER. */
function columnEnum<const V extends readonly number[]>(
  values: V,
): EnumColumnBuilder<V[number]>;
/** `Column.enum([1n, 2n])` — BIGINT. */
function columnEnum<const V extends readonly bigint[]>(
  values: V,
): EnumColumnBuilder<V[number]>;
function columnEnum(
  values: readonly (string | number | bigint)[],
): EnumColumnBuilder<never> {
  if (values.every((v) => typeof v === 'string')) {
    const length = Math.max(...values.map((v) => (v as string).length));
    return new EnumColumnBuilder({
      type: 'VARCHAR',
      length,
      guard: Guardian.enum(values) as never,
    });
  }
  if (values.every((v) => typeof v === 'number')) {
    return new EnumColumnBuilder({
      type: 'INTEGER',
      guard: Guardian.enum(values) as never,
    });
  }
  if (values.every((v) => typeof v === 'bigint')) {
    return new EnumColumnBuilder({
      type: 'BIGINT',
      guard: Guardian.enum(values) as never,
    });
  }
  throw new Error(
    'Column.enum(): values must be all-string, all-number, or all-bigint.',
  );
}

/**
 * Column factories — the entry point for every column. Each returns
 * an immutable, chainable builder (`Column.varchar(255).nullable()
 * .default('x')`). Illegal chains don't type-check.
 *
 * @example
 * ```typescript
 * const columns = {
 *   id: Column.uuid().default({ $$_expression: 'UUID' }),
 *   email: Column.varchar(255)
 *     .guard(Guardian.string().trim().toLowerCase().email())
 *     .encrypt().hash(),
 *   role: Column.enum(['admin', 'user']).default('user'),
 * };
 * ```
 */
export const Column = {
  varchar: (length: number): StringColumnBuilder =>
    new StringColumnBuilder({ type: 'VARCHAR', length }),
  char: (length: number): StringColumnBuilder =>
    new StringColumnBuilder({ type: 'CHAR', length }),
  text: (): StringColumnBuilder => new StringColumnBuilder({ type: 'TEXT' }),
  uuid: (): StringColumnBuilder => new StringColumnBuilder({ type: 'UUID' }),
  /** `VARCHAR(26)` defaulted to a fresh {@link ulid} per row. Plain
   * `VARCHAR` — NOT `Column.uuid()`, whose native `UUID` type on
   * Postgres/MariaDB rejects a non-hyphenated-hex string. */
  ulid: (): StringColumnBuilder<string, true> =>
    new StringColumnBuilder({ type: 'VARCHAR', length: 26 }).default(
      () => ulid(),
    ),
  /** `VARCHAR(25)` defaulted to a fresh {@link cuid} per row. */
  cuid: (): StringColumnBuilder<string, true> =>
    new StringColumnBuilder({ type: 'VARCHAR', length: 25 }).default(
      () => cuid(),
    ),
  /** `VARCHAR(length)` defaulted to a fresh {@link cuid2} per row
   * (default length 24, matching `cuid2`'s own default). */
  cuid2: (length: number = 24): StringColumnBuilder<string, true> =>
    new StringColumnBuilder({ type: 'VARCHAR', length }).default(
      () => cuid2(length),
    ),
  /** `VARCHAR(size)` defaulted to a fresh {@link nanoID} per row
   * (default size 21, matching `nanoID`'s own default). */
  nanoId: (size: number = 21): StringColumnBuilder<string, true> =>
    new StringColumnBuilder({ type: 'VARCHAR', length: size }).default(
      () => nanoID(size),
    ),
  /** `VARCHAR(26)` defaulted to {@link ObjectID}, instantiated ONCE
   * here so every row shares the same counter/machine-id sequence. */
  objectId: (): StringColumnBuilder<string, true> =>
    new StringColumnBuilder({ type: 'VARCHAR', length: 26 }).default(
      ObjectID(),
    ),
  /** `BIGINT` defaulted to {@link simpleID}, instantiated ONCE here so
   * every row shares the same counter/seed. */
  simpleId: (): NumberColumnBuilder<bigint, true> =>
    new NumberColumnBuilder<bigint>({ type: 'BIGINT' }).default(
      simpleID(),
    ),
  /** `CLOB` — character large object (unbounded text). Renders as
   * `TEXT` / `LONGTEXT` / `TEXT` (pg/maria/sqlite). String validators apply. */
  clob: (): StringColumnBuilder => new StringColumnBuilder({ type: 'CLOB' }),
  /** `XML` document, carried as a `string`. Native `XML` on Postgres,
   * `TEXT` elsewhere. String validators apply. */
  xml: (): StringColumnBuilder => new StringColumnBuilder({ type: 'XML' }),
  integer: (): NumberColumnBuilder =>
    new NumberColumnBuilder({ type: 'INTEGER' }),
  /** `INT` — whole number (dialect synonym of {@linkcode Column.integer}). */
  int: (): NumberColumnBuilder => new NumberColumnBuilder({ type: 'INT' }),
  /** `TINYINT` — 1-byte whole number. Numeric validators apply. */
  tinyint: (): NumberColumnBuilder =>
    new NumberColumnBuilder({ type: 'TINYINT' }),
  /** `SMALLINT` — 2-byte whole number. Numeric validators apply. */
  smallint: (): NumberColumnBuilder =>
    new NumberColumnBuilder({ type: 'SMALLINT' }),
  bigint: (): NumberColumnBuilder<bigint> =>
    new NumberColumnBuilder<bigint>({ type: 'BIGINT' }),
  decimal: (precision: number, scale: number): NumberColumnBuilder =>
    new NumberColumnBuilder({ type: 'DECIMAL', precision, scale }),
  /** `NUMERIC(precision, scale)` — exact fixed-point (dialect synonym of
   * `DECIMAL`; renders as `NUMERIC` / `DECIMAL` / `NUMERIC`). */
  numeric: (precision: number, scale: number): NumberColumnBuilder =>
    new NumberColumnBuilder({ type: 'NUMERIC', precision, scale }),
  float: (): NumberColumnBuilder => new NumberColumnBuilder({ type: 'FLOAT' }),
  double: (): NumberColumnBuilder =>
    new NumberColumnBuilder({ type: 'DOUBLE' }),
  real: (): NumberColumnBuilder => new NumberColumnBuilder({ type: 'REAL' }),
  /** `BIT` — bit value, carried as a `number`. Renders as `BIT` /
   * `BIT` / `INTEGER` (pg/maria/sqlite). */
  bit: (): ColumnBuilder<number> => new ColumnBuilder<number>({ type: 'BIT' }),
  boolean: (): ColumnBuilder<boolean> =>
    new ColumnBuilder<boolean>({ type: 'BOOLEAN' }),
  date: (): DateColumnBuilder => new DateColumnBuilder({ type: 'DATE' }),
  /** Time-of-day (`TIME`). Values ride as `Date` — only the clock
   * part is significant at the database. */
  time: (): DateColumnBuilder => new DateColumnBuilder({ type: 'TIME' }),
  /** `DATETIME` — for engines/schemas that distinguish it from
   * TIMESTAMP (MariaDB famously does). Values ride as `Date`. */
  datetime: (): DateColumnBuilder =>
    new DateColumnBuilder({ type: 'DATETIME' }),
  /** `TIMESTAMP` — wall-clock, no zone. Values ride as `Date`. */
  timestamp: (): DateColumnBuilder =>
    new DateColumnBuilder({ type: 'TIMESTAMP' }),
  /** `TIMESTAMPTZ` — timestamp WITH time zone. `TIMESTAMPTZ` on Postgres,
   * tz-aware `TIMESTAMP` on MariaDB (stored UTC), ISO-8601-with-offset
   * `TEXT` on SQLite. Values ride as `Date`; prefer this over
   * {@linkcode Column.timestamp} whenever the instant matters. */
  timestamptz: (): DateColumnBuilder =>
    new DateColumnBuilder({ type: 'TIMESTAMPTZ' }),
  /**
   * Typed JSON column. Renders as **`JSONB`** on Postgres (binary,
   * indexable — bare `JSON` is never emitted), native `JSON` on
   * MariaDB/MySQL, and `TEXT` on SQLite.
   *
   * `Column.json<{ tags: string[] }>()` — `Shape` is a phantom; the
   * runtime only checks "non-array object". `Column.json(Guardian
   * .object({...}))` — `Shape` is INFERRED from the schema, which
   * becomes the column's real runtime validator (per-key, not just
   * "is an object"). See [Validators](../docs/NORM-Schema.md#validators).
   */
  json: columnJson,
  /**
   * Restricts to the given literals AND narrows the TS type to their
   * union — no `as const` needed. `Column.enum(['active', 'banned'])`
   * → `VARCHAR`, width = the longest value; `Column.enum([1, 2, 3])` →
   * `INTEGER`; `Column.enum([1n, 2n])` → `BIGINT`. `.guard()` is
   * unavailable here — see {@linkcode EnumColumnBuilder}.
   */
  enum: columnEnum,
  /** Raw bytes (`BLOB`). Values ride as `Uint8Array`. Binary columns
   * cannot `encrypt()` — the crypto codec is text-canonical; encrypt
   * the encoded text form instead if you need that. */
  blob: (): ColumnBuilder<Uint8Array> =>
    new ColumnBuilder<Uint8Array>({ type: 'BLOB' }),
  /** Fixed-length raw bytes (`BINARY(n)`). Values ride as `Uint8Array`;
   * like {@linkcode Column.blob}, not encryptable (the codec is text). */
  binary: (length: number): ColumnBuilder<Uint8Array> =>
    new ColumnBuilder<Uint8Array>({ type: 'BINARY', length }),
  /** Variable-length raw bytes (`VARBINARY(n)`). Values ride as
   * `Uint8Array`; like {@linkcode Column.blob}, not encryptable. */
  varbinary: (length: number): ColumnBuilder<Uint8Array> =>
    new ColumnBuilder<Uint8Array>({ type: 'VARBINARY', length }),
  /**
   * Virtual masked column: `Column.mask('card', v => '****' +
   * v.slice(-4))`. Computed from `source` on every read (RETURNING
   * included); never stored. Type the fn's parameter to the SOURCE's
   * logical type (`(v: Date) => …` for an encrypted timestamp).
   */
  mask: <V = string>(
    source: string,
    fn: (v: V) => string,
  ): MaskColumnBuilder =>
    new MaskColumnBuilder({
      type: 'VARCHAR',
      masked: { source, fn: fn as (v: never) => string },
      disableInsert: true,
      disableUpdate: true,
      filterable: false,
    } as ColumnSpec<string, false>),
  /**
   * One-way digest column (`Column.hash('SHA-256')`, default
   * SHA-256): write and filter by plaintext, store only the digest.
   * The VARCHAR length derives from the algorithm (64/96/128).
   */
  hash: (algorithm: DigestAlgorithm = 'SHA-256'): DigestColumnBuilder =>
    new DigestColumnBuilder({
      type: 'VARCHAR',
      length: DIGEST_LENGTHS[algorithm],
      hashed: algorithm,
      // A salted PBKDF2 hash is non-deterministic → not matchable by a
      // plaintext-equality filter; verify against the stored value instead.
      ...(algorithm === 'PBKDF2' ? { filterable: false } : {}),
    }),
  /**
   * Password column. Two modes — you pick:
   *
   * - `Column.password('SHA-256' | 'SHA-384' | 'SHA-512')` (default
   *   `'SHA-256'`) — a **deterministic** digest, identical to
   *   {@linkcode Column.hash}: write and **filter by plaintext**, store
   *   only the digest. Fast, searchable, but a leaked table is
   *   brute-forceable.
   * - `Column.password('PBKDF2')` — a **salted** PBKDF2 hash (the correct
   *   choice for real passwords). Each hash is unique, so the column is
   *   **not filterable** — read the row and verify with
   *   {@linkcode pbkdf2Verify}(candidate, row.field). Override the KDF via
   *   the instance's `crypto.pbkdf2Hash`.
   *
   * Chain `.guard()` either way to enforce a password policy on the
   * plaintext, e.g. `Column.password('PBKDF2')
   * .guard(Guardian.string().minLength(12))`.
   */
  password: (algorithm: DigestAlgorithm = 'SHA-256'): DigestColumnBuilder =>
    new DigestColumnBuilder({
      type: 'VARCHAR',
      length: DIGEST_LENGTHS[algorithm],
      hashed: algorithm,
      // PBKDF2 is salted → non-filterable; verify against the stored hash.
      ...(algorithm === 'PBKDF2' ? { filterable: false } : {}),
    }),
} as const;

/**
 * @module
 *
 * `ReadRepo` / `Repo` / `QueryAccessor` — ALL of norm's runtime
 * behavior, in one file, linear: every public method reads
 * top-to-bottom with the built-in features as visible inline steps.
 *
 * ```
 * find():    filterable guard → plan → SELECT IR → execute
 *            → parse join JSON → decrypt → unwrap relations
 *            → afterRead column transforms → afterRead row hook
 * insert():  beforeInsert row hook → beforeWrite column transforms
 *            → GENERATED-GUARDIAN validation (fills declared defaults
 *            via .optional(default); rejects out-of-scope columns)
 *            → post-validation defaults (DB expressions +
 *            scope-excluded system columns) → encrypt + hash
 *            → INSERT IR → execute → decrypt RETURNING → hidden strip
 *            → afterRead transforms → afterRead row hook
 * ```
 *
 * Extension points are the TYPED per-entity hooks declared on the
 * definition (`hooks.beforeInsert` receives the insert-payload shape;
 * `hooks.afterRead` the default-read row shape). Battle-tested
 * algorithm bodies (join planning, row crypto, IR literals) are
 * carried from the v3/v4 reference implementation.
 *
 * @since 1.0.0
 */

import type { Query, QueryFilter } from '@tundralibs/oql/types';
import type {
  ColumnSpec,
  DefaultRowOf,
  EmittedForeignKey,
  PrimaryKeyOf,
  ProjectedRowOf,
  ProjectionInput,
  QueryDefinition,
  ReadRowOf,
  RowOf,
  ScopedInsertOf,
  TableDefinition,
  UpdateOf,
  ValidProjection,
} from './definition/mod.ts';
import type { FilterOf } from './definition/filter.ts';
import { type CompiledEntity, decryptCell, type Runtime } from './compile.ts';
import { coerceCount, makeResult, type NormResult, ulid } from './result.ts';
import type { NormScope } from './scope.ts';
import type { Executor, ExecutorQuery, NormDMLQuery } from './executor.ts';
import { isExpressionValue, validateRows } from './guardians.ts';
import {
  canonicalizePlain,
  type HashAlgorithm,
  SIBLING_HASH_ALGORITHM,
} from './crypto.ts';
import {
  NormCryptoError,
  NormHookError,
  NormQueryError,
  NormValidationError,
  type ValidationIssue,
} from './errors/mod.ts';

/** Erased row shape used internally. Typed generics apply at the
 * public method boundaries only. */
type Row = Record<string, unknown>;

/** Loose structural bound shared by the repo generics. */
type AnyDef = { readonly columns: Record<string, ColumnSpec> };
type AnyTableDef = AnyDef & { readonly primaryKeys: readonly string[] };

/** Aggregate functions exposed on the typed find() surface. */
export type AggregateFn = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

/** One aggregate request: `{ fn: 'SUM', column: '@clicks' }`. */
export type AggregateInput = Record<
  string,
  { readonly fn: AggregateFn; readonly column: `@${string}` }
>;

/** Aggregate outputs land as the driver returns them — numbers on
 * SQLite, BIGINT/NUMERIC strings on Postgres/Maria. Coerce at the
 * call site when you know the column. */
export type AggRowOf<A extends AggregateInput> = {
  [K in keyof A]: number | string | bigint | null;
};

/** Options for {@link ReadRepo.find} — the filter is the FIRST
 * positional argument, not an option. Joins are declared through
 * `project` (relation aliases) and derived from filter references;
 * raw OQL joins live behind `db.query()`. */
export type FindOptions = {
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  project?: ProjectionInput;
  /** Grouped report queries on the typed surface: named aggregates
   * over LOCAL plain columns. The projection keys become the GROUP
   * BY (OQL auto-groups every non-aggregated projection key). Cannot
   * combine with relation projections or `total: true`. */
  aggregates?: AggregateInput;
  limit?: number;
  offset?: number;
  /** `false` = leave ciphertext in place (no secret touched). */
  decrypt?: boolean;
  /** `true` = also run a COUNT with the same filter (+ its joins) and
   * surface it as `result.total` — the answer to "how many match in
   * TOTAL" when limit/offset paginate `data`. */
  total?: boolean;
};

/** Resolved projection plan (join planner output). */
type ProjectionPlan = {
  oqlJoins: Record<string, {
    table: string;
    schema?: string;
    columns: string[];
    type: 'LEFT';
    on: Record<string, string>;
  }>;
  oqlProjection: Record<string, true | string>;
  oqlAggregates: Record<string, unknown>;
  /** The filter to EXECUTE — the caller's rewritten `where`, with
   * refs to unprojected to-many relations lifted into `$exists`
   * subqueries (identical reference when nothing needed lifting). */
  where: Row | undefined;
  /** Output key → `<registryKey>.<col>` provenance. */
  aliasMap: Map<string, string>;
  relations: Array<{
    outputKey: string;
    targetKey: string;
    /** Whole-relation expansion (default target shape) — the only
     * form that carries computed masks. */
    whole: boolean;
    cardinality: 'belongsTo' | 'hasOne' | 'hasMany';
    columnFqns: Record<string, string>;
  }>;
  /** Hidden GROUP-BY anchors added by eager synthesis (all-hidden
   * entities): fetched for the aggregate, stripped from results. */
  anchorStrips: string[];
  /** Virtual masks to compute post-read: output key ← fn(sourceOut).
   * `strip` = the fetched source was NOT itself requested. */
  masks: Array<{
    outputKey: string;
    sourceOut: string;
    strip: boolean;
    /** Source is an encrypted column — skip compute on decrypt:false
     * reads (the fn must never see ciphertext). */
    sourceEncrypted: boolean;
    fn: (v: unknown) => unknown;
  }>;
};

/**
 * Pick the accessor type for an entity by its `type` discriminator —
 * what `db.repo(key)` returns. The registry `R` and the entity's own
 * key thread through so projected returns can resolve relation
 * TARGET types (and reverse relations) across the registry.
 */
export type RepoFor<
  R,
  K extends keyof R & string,
  Scope extends string = never,
> = R[K] extends { readonly type: 'TABLE' }
  ? Repo<R, K, Extract<R[K], AnyTableDef>, Scope>
  : R[K] extends { readonly type: 'VIEW' } ? ReadRepo<R, K>
  : R[K] extends { readonly type: 'QUERY' }
    ? QueryAccessor<Extract<R[K], AnyDef>>
  : never;

// =============================================================================
// ReadRepo — the read surface (VIEW entities; base of Repo)
// =============================================================================

/**
 * Read accessor for a VIEW (and the base of {@link Repo}). Exposes
 * `find` / `findOne` / `count` with typed filters and projections;
 * writes live on {@link Repo}. Obtained from `db.repo(key)` — not
 * constructed directly.
 */
export class ReadRepo<
  R,
  Self extends keyof R & string,
  D extends AnyDef = Extract<R[Self], AnyDef>,
> {
  protected readonly _runtime: Runtime;
  protected readonly _compiled: CompiledEntity;
  protected readonly _executor: Executor;
  protected readonly _txId: string | undefined;
  /** Effective scope, inherited from the `db.scope(...)` handle this
   * repo was reached through, and not yet narrowed — _scopeForOp
   * filters it to THIS entity's columns. undefined = unscoped. */
  protected readonly _scope: NormScope | undefined;

  /**
   * Internal — constructed by the runtime, not by user code; reach a
   * repo through `db.repo(key)`.
   * @param runtime - The compiled registry (shared).
   * @param compiled - The entity plan this repo is bound to.
   * @param executor - The engine seam it issues queries against.
   * @param txId - Set when the repo runs inside a transaction.
   * @param scope - The active `db.scope(...)` filter, if any.
   */
  public constructor(
    runtime: Runtime,
    compiled: CompiledEntity,
    executor: Executor,
    txId?: string,
    scope?: NormScope,
  ) {
    this._runtime = runtime;
    this._compiled = compiled;
    this._executor = executor;
    this._txId = txId;
    this._scope = scope;
  }

  /** The subset of the scope whose columns EXIST on this entity —
   * graceful: keys the entity lacks are silently skipped, so one
   * scope handle spans a mixed registry. Returns null when nothing
   * applies (unscoped for this entity). */
  protected _scopeForOp(): Map<string, unknown> | null {
    if (this._scope === undefined) return null;
    const cols = this._compiled.def.columns as Record<string, unknown>;
    const out = new Map<string, unknown>();
    for (const [col, value] of this._scope) {
      if (col in cols) out.set(col, value);
    }
    return out.size > 0 ? out : null;
  }

  /** `@column` → value form of the applied scope, for the envelope's
   * `scoped` field (null when nothing applied). */
  protected _scopedEnvelope(
    applied: Map<string, unknown> | null,
  ): Record<string, unknown> | undefined {
    if (applied === null) return undefined;
    const out: Record<string, unknown> = {};
    for (const [col, v] of applied) out[`@${col}`] = v;
    return out;
  }

  /** AND the applied scope into a caller's (already prepared) WHERE.
   *
   * Scope conditions run through the SAME `_prepareWhere` path as a
   * caller filter, so a scope on an `.encrypt().hash()` column rewrites
   * to digest equality on its `<col>_hash` sibling (comparing against
   * the stored digest, not the IV-randomised ciphertext) and a scope
   * on an unfilterable / encrypt-without-hash column throws instead of
   * silently matching nothing. */
  protected async _mergeScopeWhere(
    where: QueryFilter | undefined,
    applied: Map<string, unknown> | null,
  ): Promise<QueryFilter | undefined> {
    if (applied === null) return where;
    const scopeInput: Row = {};
    for (const [col, v] of applied) scopeInput[`@${col}`] = v;
    const scopeWhere = await this._prepareWhere(scopeInput);
    if (where === undefined || Object.keys(where).length === 0) {
      return scopeWhere;
    }
    return { $and: [scopeWhere, where] } as unknown as QueryFilter;
  }

  /** The definition this accessor is bound to. */
  public get definition(): D {
    return this._compiled.def as unknown as D;
  }

  /** Default-read rows. Projected calls get exact literal-derived
   * types ({@linkcode ProjectedRowOf}): locals + renames, belongsTo
   * as `object | null`, reverse relations as arrays (or `| null`
   * under `reverseCardinality: 'hasOne'`). Filters may reference
   * `.encrypt().hash()` columns — equality rewrites to digest
   * equality on the sibling transparently. */
  public find(
    filter?: FilterOf<R, Self>,
  ): Promise<NormResult<DefaultRowOf<R, Self>[]>>;
  public find<
    const P extends ProjectionInput & ValidProjection<R, Self, P>,
    const A extends AggregateInput,
  >(
    filter: FilterOf<R, Self> | undefined,
    options: Omit<FindOptions, 'project' | 'aggregates' | 'total'> & {
      project: P;
      aggregates: A;
    },
  ): Promise<NormResult<(ProjectedRowOf<R, Self, P> & AggRowOf<A>)[]>>;
  public find<const A extends AggregateInput>(
    filter: FilterOf<R, Self> | undefined,
    options: Omit<FindOptions, 'project' | 'aggregates' | 'total'> & {
      project?: never;
      aggregates: A;
    },
  ): Promise<NormResult<AggRowOf<A>[]>>;
  public find<const P extends ProjectionInput & ValidProjection<R, Self, P>>(
    filter: FilterOf<R, Self> | undefined,
    options: Omit<FindOptions, 'project' | 'aggregates'> & { project: P },
  ): Promise<NormResult<ProjectedRowOf<R, Self, P>[]>>;
  public find(
    filter?: FilterOf<R, Self>,
    options?: FindOptions & { project?: never; aggregates?: never },
  ): Promise<NormResult<DefaultRowOf<R, Self>[]>>;
  public async find(
    filter?: FilterOf<R, Self>,
    options: FindOptions = {},
  ): Promise<NormResult<Row[]>> {
    const id = ulid();
    const c = this._compiled;
    const decrypt = options.decrypt !== false;

    // 1. WHERE: guard + transparent hashed rewrite. An EMPTY filter
    //    ({}) means "all rows" — the translator rejects where:{}, so
    //    normalize it away. orderBy: guard only — ordering by digest
    //    is meaningless, so hashed columns stay rejected there.
    let where = filter !== undefined &&
        Object.keys(filter as Row).length > 0
      ? await this._prepareWhere(filter as Row)
      : undefined;
    // Scope: AND the applicable equality partition into the WHERE.
    const scopeApplied = this._scopeForOp();
    where = await this._mergeScopeWhere(where, scopeApplied);
    if (options.orderBy !== undefined) {
      const aggAliases = options.aggregates !== undefined
        ? new Set(Object.keys(options.aggregates).map((a) => `@${a}`))
        : undefined;
      const orderable = aggAliases === undefined
        ? options.orderBy
        : Object.fromEntries(
          Object.entries(options.orderBy).filter(([k]) => !aggAliases.has(k)),
        );
      this._assertFilterable(orderable as Row);
    }

    // 2. Resolve projection + smart joins. Filter-only joins are
    //    planned but NEVER projected — a relation appears in result
    //    rows only when `project` names it. Projection-LESS reads on
    //    entities with EAGER relations synthesize the equivalent
    //    projection (locals + masks + eager aliases) and ride the
    //    same machinery — depth-1 by construction, since whole-
    //    relation targets expand to their LOCAL default shape.
    let effProject = options.project as ProjectionInput | undefined;
    if (effProject === undefined && options.aggregates !== undefined) {
      // Aggregate-only query: no implicit default/eager projection —
      // projection keys are the GROUP BY, so only explicit ones count.
      effProject = {};
    }
    if (effProject === undefined) {
      const eagerKeys = this._runtime.eager.get(c.key);
      if (eagerKeys !== undefined && eagerKeys.length > 0) {
        const synth: Record<string, true> = {};
        for (const col of c.projectedColumns) synth[`@${col}`] = true;
        for (const m of c.maskedProjected) synth[`@${m}`] = true;
        for (const e of eagerKeys) synth[`@${e}`] = true;
        if (
          c.projectedColumns.length === 0 && c.maskedProjected.length === 0
        ) {
          // All locals hidden (pure-junction pattern): the JSON
          // aggregates still need a GROUP-BY anchor — fetch the pk
          // columns and strip them from the results.
          const pk =
            (c.def as { primaryKeys?: readonly string[] }).primaryKeys ?? [];
          for (const col of pk) synth[`@${col}`] = true;
        }
        effProject = synth;
      }
    }
    const plan = this._resolveProjection(
      effProject,
      where as Row | undefined,
      options.orderBy as Row | undefined,
    );
    if (options.aggregates !== undefined) {
      this._mergeAggregates(plan, options.aggregates, options);
    }
    if (
      effProject !== undefined && options.project === undefined &&
      c.projectedColumns.length === 0 && c.maskedProjected.length === 0
    ) {
      // The pk anchors were synthesis-internal — strip them post-read.
      const pk = (c.def as { primaryKeys?: readonly string[] }).primaryKeys ??
        [];
      plan.anchorStrips.push(...pk);
    }

    // 2b. total:true pre-validates its COUNT plan BEFORE anything
    //     executes: the count re-plans the filter WITHOUT projection —
    //     a filter on a PROJECTED to-many relation joins for the
    //     SELECT but lifts to `$exists` for the COUNT (no fan-out,
    //     no DISTINCT needed).
    let countPlan: ProjectionPlan | undefined;
    if (options.total === true && where !== undefined) {
      try {
        countPlan = this._resolveProjection(undefined, where as Row, undefined);
      } catch (cause) {
        throw new NormQueryError(
          `total: true cannot COUNT this filter — drop total or ` +
            `filter another way.`,
          { entity: c.key, code: 'INVALID_PROJECTION' },
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      }
    }

    // 3. Build the SELECT IR. Limit-less reads page at the entity's
    //    defaultPageSize (10 unless declared); 0 — declared OR passed
    //    — means UNBOUNDED, and every such read emits a warning event.
    const effLimit = options.limit ??
      (c.def as { defaultPageSize?: number }).defaultPageSize ?? 10;
    if (effLimit === 0) {
      this._runtime.emit(
        'warning',
        c.key,
        'SELECT',
        'unbounded-read',
        `${c.key}.find() running UNBOUNDED (defaultPageSize/limit 0) — ` +
          `fetches every row.`,
      );
    }
    const q = {
      type: 'SELECT',
      ...this._irBase(),
      columns: c.columnNames,
      projection: plan.oqlProjection,
      ...(Object.keys(plan.oqlJoins).length > 0
        ? { joins: plan.oqlJoins }
        : {}),
      ...(Object.keys(plan.oqlAggregates).length > 0
        ? { aggregates: plan.oqlAggregates }
        : {}),
      ...(plan.where ? { where: plan.where } : {}),
      ...(options.orderBy ? { orderBy: options.orderBy } : {}),
      ...(effLimit !== 0 ? { limit: effLimit } : {}),
      ...(typeof options.offset === 'number' ? { offset: options.offset } : {}),
    } as NormDMLQuery;

    // 4. Execute (tx-bound when this repo is tx-scoped).
    const res = await this._executor.execute<Row>(q);
    this._emitCall('SELECT', res.time, res.isSlow, id);
    const rows = res.data;

    // 4b. A grouped report that came back EXACTLY full on a limit the
    //     caller never asked for is almost certainly truncated — and a
    //     truncated report reads as a complete one. The page cap still
    //     applies (an unbounded GROUP BY over a large table is its own
    //     hazard); it just stops being silent.
    if (
      options.aggregates !== undefined && options.limit === undefined &&
      effLimit !== 0 && rows.length === effLimit
    ) {
      this._runtime.emit(
        'warning',
        c.key,
        'SELECT',
        'grouped-page-cap',
        `${c.key}.find() returned ${rows.length} groups — exactly the ` +
          `default page size. Grouped aggregates are NOT exempt from ` +
          `paging: pass an explicit limit (or limit: 0 for every group) ` +
          `or the report is silently truncated.`,
      );
    }

    // 5. JSON-parse relation values (SQLite returns aggregates as text).
    this._parseJoinJson(rows, plan);

    // 6. Decrypt encrypted result columns — top-level and inside
    //    relation values.
    if (decrypt) await this._decryptRead(rows, plan);

    // 7. Drop all-null LEFT-JOIN placeholders; unwrap belongsTo /
    //    hasOne to object-or-null, keep hasMany as arrays.
    this._unwrapRelations(rows, plan);

    // 8. Virtual masks: compute from the decoded source values, then
    //    strip sources that were fetched only for the compute.
    this._applyMasks(rows, plan, decrypt);

    // 9. afterRead COLUMN transforms (projection renames honored;
    //    encrypted columns skipped when decryption was opted out).
    this._applyAfterReadTransforms(rows, plan, decrypt);

    // 10. afterRead ROW hook, per row, after everything above.
    await this._runAfterReadHook(rows);

    // 10. Opt-in TOTAL: a second COUNT sharing the same rewritten
    //     filter — to-many refs run as `$exists` in ITS plan (never
    //     the projection's aggregates/joins, which would fan out).
    let total: number | undefined;
    if (options.total === true) {
      const cq = {
        type: 'COUNT',
        ...this._irBase(),
        columns: c.columnNames,
        ...(countPlan !== undefined &&
            Object.keys(countPlan.oqlJoins).length > 0
          ? { joins: countPlan.oqlJoins }
          : {}),
        ...(countPlan?.where !== undefined
          ? { where: countPlan.where }
          : where
          ? { where }
          : {}),
      } as NormDMLQuery;
      const cres = await this._executor.execute<Row>(cq);
      this._emitCall('COUNT', cres.time, cres.isSlow, id);
      total = coerceCount(cres.data[0]?.Count);
    }

    return makeResult<Row[]>({
      id,
      op: 'SELECT',
      txId: this._txId,
      count: rows.length,
      time: res.time,
      isSlow: res.isSlow,
      total,
      scoped: this._scopedEnvelope(scopeApplied),
      data: rows,
    });
  }

  /** First matching row (even when several match), or null. */
  public findOne(
    filter?: FilterOf<R, Self>,
  ): Promise<NormResult<DefaultRowOf<R, Self> | null>>;
  public findOne<
    const P extends ProjectionInput & ValidProjection<R, Self, P>,
  >(
    filter: FilterOf<R, Self> | undefined,
    options: Omit<FindOptions, 'limit' | 'project'> & { project: P },
  ): Promise<NormResult<ProjectedRowOf<R, Self, P> | null>>;
  public findOne(
    filter?: FilterOf<R, Self>,
    options?: Omit<FindOptions, 'limit'> & { project?: never },
  ): Promise<NormResult<DefaultRowOf<R, Self> | null>>;
  public async findOne(
    filter?: FilterOf<R, Self>,
    options: Omit<FindOptions, 'limit'> = {},
    // deno-lint-ignore no-explicit-any
  ): Promise<NormResult<any>> {
    const r = await (this.find as (
      f?: FilterOf<R, Self>,
      o?: FindOptions,
    ) => Promise<NormResult<Row[]>>)(filter, { ...options, limit: 1 });
    const row = r.data[0] ?? null;
    // Same envelope (and id) as the underlying SELECT. NormResult<any>
    // resolves to the no-data branch, so annotate before returning.
    const out: NormResult<Row | null> = {
      ...r,
      data: row,
      count: row === null ? 0 : 1,
    };
    // deno-lint-ignore no-explicit-any
    return out as any;
  }

  /** The envelope's `count` carries the answer; there is no `data`. */
  public async count(filter?: FilterOf<R, Self>): Promise<NormResult> {
    const id = ulid();
    const c = this._compiled;
    // Same guard + hashed rewrite as find(); joined refs plan their
    // filter-driven joins (a COUNT IR referencing an alias with no
    // joins block fails translator validation). Empty {} = all rows.
    const where = filter !== undefined &&
        Object.keys(filter as Row).length > 0
      ? await this._prepareWhere(filter as Row)
      : undefined;
    const plan = where !== undefined
      ? this._resolveProjection(undefined, where as Row, undefined)
      : undefined;
    const scopeApplied = this._scopeForOp();
    const effWhere = await this._mergeScopeWhere(
      (plan?.where ?? where) as QueryFilter | undefined,
      scopeApplied,
    );
    const q = {
      type: 'COUNT',
      ...this._irBase(),
      columns: c.columnNames,
      ...(plan !== undefined && Object.keys(plan.oqlJoins).length > 0
        ? { joins: plan.oqlJoins }
        : {}),
      ...(effWhere ? { where: effWhere } : {}),
    } as NormDMLQuery;
    const res = await this._executor.execute<Row>(q);
    this._emitCall('COUNT', res.time, res.isSlow, id);
    return makeResult({
      id,
      op: 'COUNT',
      txId: this._txId,
      // Postgres/MariaDB return COUNT() as BIGINT-string; coerce.
      count: coerceCount(res.data[0]?.Count),
      time: res.time,
      isSlow: res.isSlow,
      scoped: this._scopedEnvelope(scopeApplied),
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // Read helpers
  // ───────────────────────────────────────────────────────────────────

  protected _irBase(): { table: string; schema?: string } {
    const def = this._compiled.def as { name: string; dbSchema?: string };
    return {
      table: def.name,
      ...(def.dbSchema !== undefined ? { schema: def.dbSchema } : {}),
    };
  }

  /** Reject references to non-filterable columns in where / orderBy.
   * Joined `@Alias.@col` refs resolve the alias (FK first, then
   * reverse relation) and check the TARGET entity's columns via the
   * registry-key-keyed FQN set. Recurses through `$and`/`$or`/`$not`. */
  protected _assertFilterable(filterOrOrder: Row): void {
    if (
      this._compiled.nonFilterable.size === 0 &&
      this._runtime.nonFilterableFqn.size === 0
    ) {
      return;
    }
    this.__walkFilterableRefs(filterOrOrder);
  }

  private __walkFilterableRefs(obj: unknown): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') {
      // VALUE-position column references (`'@col'`, `'@Alias.@col'`
      // as an operator RHS / $in element / expression arg) resolve to
      // real columns in the translator — guard them like keys.
      if (obj.startsWith('@')) this.__checkFilterRef(obj.slice(1));
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) this.__walkFilterableRefs(item);
      return;
    }
    if (typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj as Row)) {
      if (key.startsWith('@')) this.__checkFilterRef(key.slice(1));
      // Recurse into EVERY value — operator bags, arrays, and string
      // values may all carry column references.
      this.__walkFilterableRefs(value);
    }
  }

  /** Check one stripped reference (`col` or `Alias.@col`). */
  private __checkFilterRef(stripped: string): void {
    const c = this._compiled;
    const dotIdx = stripped.indexOf('.@');
    if (dotIdx !== -1) {
      // Joined reference. Unknown aliases fall through — the
      // projection resolver throws its own, more specific error.
      const alias = stripped.slice(0, dotIdx);
      const col = stripped.slice(dotIdx + 2);
      const target = c.joinTargets.get(alias) ??
        this._runtime.reverseMap.get(c.key)?.get(alias)?.sourceKey;
      if (target === undefined) return;
      if (this._runtime.nonFilterableFqn.has(`${target}.${col}`)) {
        throw new NormQueryError(
          `Column '${col}' on relation '${alias}' (entity '${target}') ` +
            `is not filterable (unfilterable() or implied by encrypt()).`,
          {
            entity: c.key,
            subject: `${alias}.${col}`,
            code: 'NON_FILTERABLE_COLUMN',
          },
        );
      }
      return;
    }
    if (c.nonFilterable.has(stripped)) {
      throw new NormQueryError(
        `Column '${stripped}' on entity '${c.key}' is not filterable ` +
          `(unfilterable() or implied by encrypt()).`,
        { entity: c.key, subject: stripped, code: 'NON_FILTERABLE_COLUMN' },
      );
    }
  }

  /**
   * Guard + rewrite a WHERE tree. `.encrypt().hash()` column refs
   * rewrite to digest equality on their `<col>_hash` sibling
   * (equality-class operators only); explicit `unfilterable()` and
   * encrypted-WITHOUT-hash refs throw; value-position refs are
   * guarded like keys.
   */
  protected async _prepareWhere(node: Row): Promise<QueryFilter> {
    return await this.__rewriteWhereNode(node) as QueryFilter;
  }

  private async __rewriteWhereNode(node: unknown): Promise<unknown> {
    if (node === null || node === undefined) return node;
    // Date is `typeof 'object'` with NO enumerable keys — without this
    // short-circuit the object walk below flattens it to {}.
    if (node instanceof Date) return node;
    if (typeof node === 'string') {
      // Value-position column reference — hashed columns throw here
      // too (a digest can never be compared against another column).
      if (node.startsWith('@')) this.__checkFilterRef(node.slice(1));
      return node;
    }
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      for (const item of node) out.push(await this.__rewriteWhereNode(item));
      return out;
    }
    if (typeof node !== 'object') return node;
    const out: Row = {};
    for (const [key, value] of Object.entries(node as Row)) {
      if (!key.startsWith('@')) {
        out[key] = await this.__rewriteWhereNode(value);
        continue;
      }
      const ref = this.__resolveWhereRef(key.slice(1));
      if (ref.siblingKey !== undefined) {
        out[ref.siblingKey] = await this.__hashCondition(value, ref);
        continue;
      }
      out[key] = await this.__rewriteWhereNode(value);
    }
    return out;
  }

  /** Resolve one WHERE key ref (`col` / `Alias.@col`): plain columns
   * pass through; hashed ones return their digest target (the
   * `<col>_hash` sibling for encrypt().hash(), the column ITSELF for
   * `Column.hash(algo)` digests) + normalizer + algorithm; blocked
   * ones throw. */
  private __resolveWhereRef(stripped: string): {
    entityKey: string;
    col: string;
    siblingKey: string | undefined;
    beforeWrite: ((v: unknown) => unknown) | undefined;
    algorithm: HashAlgorithm;
    plainType: string;
  } {
    const c = this._compiled;
    const dotIdx = stripped.indexOf('.@');
    const [alias, col, target] = dotIdx === -1 ? [undefined, stripped, c] : [
      stripped.slice(0, dotIdx),
      stripped.slice(dotIdx + 2),
      (() => {
        const a = stripped.slice(0, dotIdx);
        const targetKey = c.joinTargets.get(a) ??
          this._runtime.reverseMap.get(c.key)?.get(a)?.sourceKey;
        return targetKey !== undefined
          ? this._runtime.compiled.get(targetKey)
          : undefined;
      })(),
    ];
    if (target === undefined) {
      // Unknown alias — the join planner throws its own, more
      // specific error.
      return {
        entityKey: c.key,
        col,
        siblingKey: undefined,
        beforeWrite: undefined,
        algorithm: SIBLING_HASH_ALGORITHM,
        plainType: 'VARCHAR',
      };
    }
    const spec = (target.def.columns as Record<string, ColumnSpec>)[col];
    if (spec === undefined) {
      return {
        entityKey: target.key,
        col,
        siblingKey: undefined,
        beforeWrite: undefined,
        algorithm: SIBLING_HASH_ALGORITHM,
        plainType: 'VARCHAR',
      };
    }
    const sibling = spec.filterable === false
      ? undefined
      : target.hashSiblings.get(col);
    if (sibling !== undefined) {
      return {
        entityKey: target.key,
        col,
        siblingKey: alias === undefined
          ? `@${sibling}`
          : `@${alias}.@${sibling}`,
        beforeWrite: target.beforeWrite.get(col),
        algorithm: SIBLING_HASH_ALGORITHM,
        plainType: spec.type,
      };
    }
    const digestAlgo = spec.filterable === false
      ? undefined
      : target.digestColumns.get(col);
    // A salted PBKDF2 digest is non-deterministic → never filter-rewritten
    // (it is filterable:false above); `!== 'PBKDF2'` narrows to a
    // deterministic hash algorithm.
    if (digestAlgo !== undefined && digestAlgo !== 'PBKDF2') {
      // Digest columns store their own digest — the filter key stays,
      // only the VALUE rewrites.
      return {
        entityKey: target.key,
        col,
        siblingKey: alias === undefined ? `@${col}` : `@${alias}.@${col}`,
        beforeWrite: target.beforeWrite.get(col),
        algorithm: digestAlgo,
        plainType: spec.type,
      };
    }
    if (spec.filterable === false || spec.encrypt === true) {
      const hint = spec.encrypt === true && spec.hash !== true
        ? ` — declare .hash() to enable equality filtering`
        : ` (unfilterable())`;
      throw new NormQueryError(
        `Column '${col}' on entity '${target.key}' is not filterable` +
          `${hint}.`,
        { entity: target.key, subject: col, code: 'NON_FILTERABLE_COLUMN' },
      );
    }
    return {
      entityKey: target.key,
      col,
      siblingKey: undefined,
      beforeWrite: undefined,
      algorithm: SIBLING_HASH_ALGORITHM,
      plainType: spec.type,
    };
  }

  /** Rewrite one condition value for a hashed column: plaintext →
   * digest (through the column's beforeWrite, like the write path).
   * Equality-class operators only. */
  private async __hashCondition(
    value: unknown,
    ref: {
      entityKey: string;
      col: string;
      beforeWrite: ((v: unknown) => unknown) | undefined;
      algorithm: HashAlgorithm;
      plainType: string;
    },
  ): Promise<unknown> {
    const digest = async (v: unknown): Promise<unknown> => {
      if (v === null) return null;
      if (isExpressionValue(v)) {
        throw new NormQueryError(
          `Hashed column '${ref.col}' on entity '${ref.entityKey}' ` +
            `${plaintextPhrase(ref.plainType)} (or null) filter values.`,
          {
            entity: ref.entityKey,
            subject: ref.col,
            code: 'NON_FILTERABLE_COLUMN',
          },
        );
      }
      if (typeof v === 'string' && v.startsWith('@')) {
        throw new NormQueryError(
          `Hashed column '${ref.col}' on entity '${ref.entityKey}' cannot ` +
            `be compared against another column — digests support ` +
            `plaintext equality only.`,
          {
            entity: ref.entityKey,
            subject: ref.col,
            code: 'NON_FILTERABLE_COLUMN',
          },
        );
      }
      // Type-gate BEFORE beforeWrite (which assumes the logical
      // type), so a mistyped operand gets the clean rejection instead
      // of exploding inside the transform.
      try {
        canonicalizePlain(v, ref.plainType);
      } catch {
        throw new NormQueryError(
          `Hashed column '${ref.col}' on entity '${ref.entityKey}' ` +
            `${plaintextPhrase(ref.plainType)} (or null) filter values.`,
          {
            entity: ref.entityKey,
            subject: ref.col,
            code: 'NON_FILTERABLE_COLUMN',
          },
        );
      }
      const plain = ref.beforeWrite === undefined ? v : ref.beforeWrite(v);
      // Non-string plaintext (encrypted Date/bigint/… columns)
      // canonicalizes exactly like the write path, so digests line up.
      return await this._runtime.crypto.hash(
        canonicalizePlain(plain, ref.plainType),
        ref.algorithm,
      );
    };

    if (
      value === null || typeof value !== 'object' || value instanceof Date
    ) {
      return await digest(value);
    }
    if (Array.isArray(value)) {
      // Shorthand IN-list.
      return await Promise.all(value.map(digest));
    }
    if (!isExpressionValue(value)) {
      // Operator bags contain ONLY known hashed-column operators.
      // Encrypted+hashed JSON plaintext may legitimately carry
      // $-prefixed DATA keys ({$ref: 'x'}) — anything else digests as
      // the value. Residual ambiguity (a plaintext object shaped
      // exactly like {$eq: …}) resolves to the operator; wrap it in
      // {$eq: {...}} to force value semantics.
      const HASH_OPS = new Set(['$eq', '$ne', '$in', '$nin', '$null']);
      const bagKeys = Object.keys(value as Row);
      const isOpBag = bagKeys.length > 0 &&
        bagKeys.every((k) => HASH_OPS.has(k));
      if (
        (ref.plainType === 'JSON' || ref.plainType === 'JSONB') && !isOpBag
      ) {
        return await digest(value);
      }
      const out: Row = {};
      for (const [op, v] of Object.entries(value as Row)) {
        switch (op) {
          case '$eq':
          case '$ne':
            out[op] = await digest(v);
            break;
          case '$in':
          case '$nin':
            out[op] = await Promise.all((v as unknown[]).map(digest));
            break;
          case '$null':
            out[op] = v;
            break;
          default:
            throw new NormQueryError(
              `Operator '${op}' is not supported on hashed column ` +
                `'${ref.col}' (entity '${ref.entityKey}') — digests ` +
                `support equality only ($eq/$ne/$in/$nin/$null).`,
              {
                entity: ref.entityKey,
                subject: ref.col,
                code: 'NON_FILTERABLE_COLUMN',
              },
            );
        }
      }
      if (Object.keys(out).length === 0) {
        // Object.create(null) or a literal empty operator bag: zero
        // enumerable keys would otherwise slip through as `{}`.
        throw new NormQueryError(
          `Hashed column '${ref.col}' on entity '${ref.entityKey}' ` +
            `${plaintextPhrase(ref.plainType)} (or null) filter values.`,
          {
            entity: ref.entityKey,
            subject: ref.col,
            code: 'NON_FILTERABLE_COLUMN',
          },
        );
      }
      return out;
    }
    return await digest(value); // throws with the clear message
  }

  /** Validate + merge typed aggregate requests into a resolved plan:
   * each becomes an OQL aggregate projected under its alias; the
   * remaining (non-aggregated) projection keys are the GROUP BY. */
  protected _mergeAggregates(
    plan: ProjectionPlan,
    aggregates: AggregateInput,
    options: FindOptions,
  ): void {
    const c = this._compiled;
    if (options.total === true) {
      throw new NormQueryError(
        `total: true cannot combine with aggregates — the total of a ` +
          `grouped query is its row count.`,
        { entity: c.key, code: 'AGGREGATE_MISUSE' },
      );
    }
    if (plan.relations.length > 0) {
      throw new NormQueryError(
        `aggregates cannot combine with relation projections on ` +
          `'${c.key}' — group over local columns (relation reads are ` +
          `separate queries).`,
        { entity: c.key, code: 'AGGREGATE_MISUSE' },
      );
    }
    if (plan.masks.length > 0) {
      throw new NormQueryError(
        `aggregates cannot combine with mask columns on '${c.key}' — ` +
          `masks compute per row, not per group.`,
        { entity: c.key, code: 'AGGREGATE_MISUSE' },
      );
    }
    for (const out of plan.aliasMap.values()) {
      const col = out.slice(out.indexOf('.') + 1);
      if (c.localEncrypted.has(col)) {
        throw new NormQueryError(
          `'${c.key}.${col}' is encrypted — IV-randomized ciphertext ` +
            `never groups; aggregate over plain columns.`,
          { entity: c.key, subject: col, code: 'AGGREGATE_MISUSE' },
        );
      }
    }
    const FNS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
    for (const [alias, agg] of Object.entries(aggregates)) {
      if (!FNS.has(agg.fn)) {
        throw new NormQueryError(
          `Unknown aggregate fn '${agg.fn}' for '${alias}' on ` +
            `'${c.key}' — use COUNT/SUM/AVG/MIN/MAX.`,
          { entity: c.key, subject: alias, code: 'AGGREGATE_MISUSE' },
        );
      }
      if (typeof agg.column !== 'string' || !agg.column.startsWith('@')) {
        throw new NormQueryError(
          `Aggregate '${alias}' on '${c.key}': column must be a local ` +
            `'@column' reference.`,
          { entity: c.key, subject: alias, code: 'AGGREGATE_MISUSE' },
        );
      }
      const col = agg.column.slice(1);
      const columns = c.def.columns as Record<string, ColumnSpec>;
      if (!(col in columns) || c.masks.has(col)) {
        throw new NormQueryError(
          `Aggregate '${alias}' on '${c.key}': '${col}' is not a ` +
            `physical local column.`,
          { entity: c.key, subject: alias, code: 'AGGREGATE_MISUSE' },
        );
      }
      if (c.nonFilterable.has(col)) {
        throw new NormQueryError(
          `Aggregate '${alias}' on '${c.key}': '${col}' is encrypted/` +
            `unfilterable — aggregating it is meaningless.`,
          { entity: c.key, subject: alias, code: 'AGGREGATE_MISUSE' },
        );
      }
      if (plan.oqlProjection[`@${alias}`] !== undefined) {
        throw new NormQueryError(
          `Aggregate alias '${alias}' collides with a projected key on ` +
            `'${c.key}'.`,
          { entity: c.key, subject: alias, code: 'AGGREGATE_MISUSE' },
        );
      }
      plan.oqlAggregates[alias] = { $$_aggregate: agg.fn, column: `@${col}` };
      plan.oqlProjection[`@${alias}`] = true;
    }
  }

  /** Resolve the caller-supplied projection (plus filter / orderBy
   * references) into an OQL-ready join + projection + aggregate plan.
   * Carried from the reference implementation (battle-tested). */
  protected _resolveProjection(
    project: ProjectionInput | undefined,
    where: Row | undefined,
    orderBy: Row | undefined,
  ): ProjectionPlan {
    const runtime = this._runtime;
    const compiled = this._compiled;
    const oqlJoins: ProjectionPlan['oqlJoins'] = {};
    const oqlProjection: Record<string, true | string> = {};
    const oqlAggregates: Record<string, unknown> = {};
    const aliasMap = new Map<string, string>();
    const relations: ProjectionPlan['relations'] = [];
    const masks: ProjectionPlan['masks'] = [];
    const anchorStrips: string[] = [];
    // Local projections by SOURCE column name → their output key, so
    // a mask can read its source under whatever key it landed on.
    const localOut = new Map<string, string>();
    const maskReqs: Array<{ outputKey: string; name: string }> = [];

    const myFqn = (col: string): string => `${compiled.key}.${col}`;
    const columns = compiled.def.columns as Record<string, ColumnSpec>;

    const fks = (compiled.def as { foreignKeys?: Record<string, unknown> })
      .foreignKeys as Record<string, EmittedForeignKey> | undefined ?? {};
    const reverseEntries = runtime.reverseMap.get(compiled.key);

    const addCols = (alias: string, cols: ReadonlyArray<string>): void => {
      const entry = oqlJoins[alias]!;
      for (const col of cols) {
        if (!entry.columns.includes(col)) entry.columns.push(col);
      }
    };

    const ensureBtJoin = (
      alias: string,
    ): { targetKey: string; target: CompiledEntity } => {
      const fk = fks[alias]!;
      const target = runtime.compiled.get(fk.model)!;
      if (!(alias in oqlJoins)) {
        const on: Record<string, string> = {};
        for (const [localCol, remoteCol] of Object.entries(fk.on)) {
          on[`@${alias}.@${remoteCol}`] = `@${localCol}`;
        }
        const tDef = target.def as { name: string; dbSchema?: string };
        oqlJoins[alias] = {
          table: tDef.name,
          ...(tDef.dbSchema !== undefined ? { schema: tDef.dbSchema } : {}),
          columns: [],
          type: 'LEFT',
          on,
        };
      }
      return { targetKey: fk.model, target };
    };

    const ensureRevJoin = (
      name: string,
    ): { targetKey: string; target: CompiledEntity } => {
      const rel = reverseEntries!.get(name)!;
      const target = runtime.compiled.get(rel.sourceKey)!;
      if (!(name in oqlJoins)) {
        const on: Record<string, string> = {};
        for (const [targetCol, sourceCol] of Object.entries(rel.on)) {
          on[`@${name}.@${sourceCol}`] = `@${targetCol}`;
        }
        oqlJoins[name] = {
          table: rel.sourceTableName,
          ...(rel.sourceDbSchema !== undefined
            ? { schema: rel.sourceDbSchema }
            : {}),
          columns: [],
          type: 'LEFT',
          on,
        };
      }
      return { targetKey: rel.sourceKey, target };
    };

    const expandRelation = (
      name: string,
      value: ProjectionInput[string],
      resolved: { targetKey: string; target: CompiledEntity },
      cardinality: 'belongsTo' | 'hasOne' | 'hasMany',
    ): void => {
      const { targetKey, target } = resolved;
      const subProj = (typeof value === 'object' && value !== null)
        ? (value as Record<string, true | string>)
        : undefined;
      const outputKey = typeof value === 'string' ? value : name;
      const colFqns: Record<string, string> = {};

      if (subProj === undefined) {
        // Whole-relation expansion PINS the TARGET's default
        // projection via an explicit JSON aggregate — bare join-alias
        // auto-expand would serialize the join's whole shared
        // `columns` array, leaking hidden() columns whenever a
        // filter/orderBy adds one to the same join.
        addCols(name, target.projectedColumns);
        const aggCols: Record<string, string> = {};
        for (const col of target.projectedColumns) {
          aggCols[col] = `@${name}.@${col}`;
          colFqns[col] = `${targetKey}.${col}`;
        }
        // Mask SOURCES ride along (hidden ones included) so relation
        // rows can carry computed masks; extras strip post-compute.
        for (const m of target.maskedProjected) {
          const src = target.masks.get(m)!.source;
          if (aggCols[src] !== undefined) continue;
          addCols(name, [src]);
          aggCols[src] = `@${name}.@${src}`;
          colFqns[src] = `${targetKey}.${src}`;
        }
        oqlAggregates[name] = { $$_aggregate: 'JSON_ROW', columns: aggCols };
        oqlProjection[`@${name}`] = value === true ? true : (value as string);
      } else {
        const aggCols: Record<string, string> = {};
        const need: string[] = [];
        const targetColumns = target.def.columns as Record<string, unknown>;
        for (const [subKey, subVal] of Object.entries(subProj)) {
          if (!subKey.startsWith('@')) {
            throw new NormQueryError(
              `Invalid sub-projection key '${subKey}' under '@${name}' on ` +
                `'${compiled.key}': must start with '@'`,
              {
                entity: compiled.key,
                subject: `${name}.${subKey}`,
                code: 'INVALID_PROJECTION',
              },
            );
          }
          const subCol = subKey.slice(1);
          if (!(subCol in targetColumns)) {
            throw new NormQueryError(
              `Column '${subCol}' is not declared on entity ` +
                `'${targetKey}' (relation '${name}')`,
              {
                entity: compiled.key,
                subject: `${name}.${subCol}`,
                code: 'INVALID_PROJECTION',
              },
            );
          }
          if (target.masks.has(subCol)) {
            throw new NormQueryError(
              `Column '${subCol}' on '${targetKey}' is a virtual mask — ` +
                `masks in relation SUB-projections are not supported ` +
                `yet; project the whole relation ('@${name}': true).`,
              {
                entity: compiled.key,
                subject: `${name}.${subCol}`,
                code: 'INVALID_PROJECTION',
              },
            );
          }
          const outName = typeof subVal === 'string' ? subVal : subCol;
          aggCols[outName] = `@${name}.@${subCol}`;
          colFqns[outName] = `${targetKey}.${subCol}`;
          need.push(subCol);
        }
        addCols(name, need);
        oqlAggregates[name] = { $$_aggregate: 'JSON_ROW', columns: aggCols };
        oqlProjection[`@${name}`] = true;
      }

      relations.push({
        outputKey,
        targetKey,
        whole: subProj === undefined,
        cardinality,
        columnFqns: colFqns,
      });
    };

    // Pass 1: projection-driven joins + output shape.
    if (project === undefined) {
      for (const col of compiled.projectedColumns) {
        oqlProjection[`@${col}`] = true;
        aliasMap.set(col, myFqn(col));
      }
      for (const m of compiled.maskedProjected) {
        const { source, fn } = compiled.masks.get(m)!;
        const already = oqlProjection[`@${source}`] !== undefined;
        if (!already) {
          // Hidden source: fetch for the compute, strip after.
          oqlProjection[`@${source}`] = true;
          aliasMap.set(source, myFqn(source));
        }
        masks.push({
          outputKey: m,
          sourceOut: source,
          strip: !already,
          sourceEncrypted: compiled.localEncrypted.has(source),
          fn,
        });
      }
    } else {
      for (const [key, value] of Object.entries(project)) {
        if (!key.startsWith('@')) {
          throw new NormQueryError(
            `Invalid projection key '${key}' on entity '${compiled.key}': ` +
              `must start with '@'`,
            { entity: compiled.key, subject: key, code: 'INVALID_PROJECTION' },
          );
        }
        const name = key.slice(1);

        if (compiled.masks.has(name)) {
          if (value !== true && typeof value !== 'string') {
            throw new NormQueryError(
              `Invalid projection for column '${name}' on ` +
                `'${compiled.key}': sub-projection is only valid for relations`,
              {
                entity: compiled.key,
                subject: name,
                code: 'INVALID_PROJECTION',
              },
            );
          }
          maskReqs.push({
            outputKey: typeof value === 'string' ? value : name,
            name,
          });
          continue;
        }
        if (name in columns) {
          if (value !== true && typeof value !== 'string') {
            throw new NormQueryError(
              `Invalid projection for column '${name}' on ` +
                `'${compiled.key}': sub-projection is only valid for relations`,
              {
                entity: compiled.key,
                subject: name,
                code: 'INVALID_PROJECTION',
              },
            );
          }
          const outputKey = typeof value === 'string' ? value : name;
          oqlProjection[`@${name}`] = value;
          aliasMap.set(outputKey, myFqn(name));
          localOut.set(name, outputKey);
          continue;
        }

        if (name in fks) {
          expandRelation(name, value, ensureBtJoin(name), 'belongsTo');
          continue;
        }

        const revRel = reverseEntries?.get(name);
        if (revRel !== undefined) {
          expandRelation(
            name,
            value,
            ensureRevJoin(name),
            revRel.cardinality,
          );
          continue;
        }

        throw new NormQueryError(
          `Unknown projection target '${key}' on entity '${compiled.key}': ` +
            `not a column, foreign-key alias, or reverse relation.`,
          { entity: compiled.key, subject: key, code: 'INVALID_PROJECTION' },
        );
      }

      for (const req of maskReqs) {
        const { source, fn } = compiled.masks.get(req.name)!;
        let sourceOut = localOut.get(source);
        let strip = false;
        if (sourceOut === undefined) {
          if (oqlProjection[`@${source}`] === undefined) {
            oqlProjection[`@${source}`] = true;
            aliasMap.set(source, myFqn(source));
          }
          sourceOut = source;
          strip = true;
        }
        masks.push({
          outputKey: req.outputKey,
          sourceOut,
          strip,
          sourceEncrypted: compiled.localEncrypted.has(source),
          fn,
        });
      }

      // A relation-only projection has no grouping anchor — the
      // JSON-aggregate SELECT would collapse every base row into one.
      if (relations.length > 0 && aliasMap.size === 0) {
        throw new NormQueryError(
          `Projection on '${compiled.key}' selects only relations — ` +
            `include at least one local column.`,
          { entity: compiled.key, code: 'INVALID_PROJECTION' },
        );
      }
    }

    // Pass 2: filter/orderBy refs may need filter-only joins.
    const existsAliases = new Set<string>();
    const visitAliasRef = (
      alias: string,
      col: string,
      mode: 'where' | 'orderBy',
      position: 'key' | 'value',
    ): void => {
      // Column existence is validated whether or not the relation is
      // already joined via the projection — an unknown column must
      // never reach the IR just because its relation was projected.
      const joined = alias in oqlJoins;
      if (alias in fks) {
        const target = runtime.compiled.get(fks[alias]!.model)!;
        if (!(col in (target.def.columns as Record<string, unknown>))) {
          throw new NormQueryError(
            `Column '${col}' is not declared on entity ` +
              `'${fks[alias]!.model}' (FK '${alias}')`,
            {
              entity: compiled.key,
              subject: `${alias}.${col}`,
              code: 'INVALID_PROJECTION',
            },
          );
        }
        if (!joined) ensureBtJoin(alias);
        addCols(alias, [col]);
        return;
      }
      const revRel = reverseEntries?.get(alias);
      if (revRel !== undefined) {
        const target = runtime.compiled.get(revRel.sourceKey)!;
        if (!(col in (target.def.columns as Record<string, unknown>))) {
          throw new NormQueryError(
            `Column '${col}' is not declared on entity ` +
              `'${revRel.sourceKey}' (reverse '${alias}')`,
            {
              entity: compiled.key,
              subject: `${alias}.${col}`,
              code: 'INVALID_PROJECTION',
            },
          );
        }
        // FILTER-ONLY to-many ref: a bare LEFT JOIN would fan out (a
        // base row matching N related rows comes back N times, and
        // count() over-counts), so the filter is LIFTED into a
        // correlated `$exists` subquery instead of joining. Projected
        // to-many relations keep the join: their JSON aggregate
        // auto-GROUP-BYs AND the filter shapes the returned rows.
        if (!joined && revRel.cardinality === 'hasMany') {
          if (mode === 'orderBy') {
            throw new NormQueryError(
              `Ordering by to-many relation '${alias}' on ` +
                `'${compiled.key}' requires projecting it — an ` +
                `unprojected to-many runs as an EXISTS subquery, ` +
                `which has no ordering scope.`,
              {
                entity: compiled.key,
                subject: alias,
                code: 'INVALID_PROJECTION',
              },
            );
          }
          // VALUE-position ref to the same unprojected to-many: only
          // KEY-position refs can be lifted into the correlated
          // `$exists` (__liftToExists rewrites keys — a value under a
          // LOCAL key would have to compare an OUTER column against a
          // subquery column, which the EXISTS form cannot express).
          // Left alone it reached the translator as an out-of-scope
          // `@`-string, i.e. bound as DATA — silently-wrong rows. Refuse
          // the same way orderBy does, and point at the two spellings
          // that do work.
          if (position === 'value') {
            throw new NormQueryError(
              `Filter value '@${alias}.@${col}' references to-many ` +
                `relation '${alias}' on '${compiled.key}', which is not ` +
                `projected — an unprojected to-many runs as an EXISTS ` +
                `subquery and cannot supply a comparison VALUE. Project ` +
                `'${alias}' (it then joins), or write the condition ` +
                `key-position ('@${alias}.@${col}': { … }).`,
              {
                entity: compiled.key,
                subject: `${alias}.${col}`,
                code: 'INVALID_PROJECTION',
              },
            );
          }
          existsAliases.add(alias);
          return;
        }
        if (!joined) ensureRevJoin(alias);
        addCols(alias, [col]);
        return;
      }
      throw new NormQueryError(
        `Unknown relation alias '${alias}' on '${compiled.key}': not a ` +
          `foreign key or reverse relation.`,
        { entity: compiled.key, subject: alias, code: 'UNKNOWN_RELATION' },
      );
    };
    walkJoinRefs(where, (a, c, pos) => visitAliasRef(a, c, 'where', pos));
    walkJoinRefs(orderBy, (a, c, pos) => visitAliasRef(a, c, 'orderBy', pos));

    // Pass 3: ON-clause columns must be in each join's `columns`.
    for (const joinEntry of Object.values(oqlJoins)) {
      for (const onKey of Object.keys(joinEntry.on)) {
        const stripped = onKey.slice(1);
        const dotIdx = stripped.indexOf('.@');
        if (dotIdx === -1) continue;
        const col = stripped.slice(dotIdx + 2);
        if (!joinEntry.columns.includes(col)) joinEntry.columns.push(col);
      }
    }

    return {
      oqlJoins,
      oqlProjection,
      oqlAggregates,
      where: existsAliases.size > 0
        ? this.__liftToExists(where, existsAliases) as Row
        : where,
      aliasMap,
      relations,
      masks,
      anchorStrips,
    };
  }

  /** Rewrite refs to UNPROJECTED to-many relations into correlated
   * `$exists` subqueries — the fan-out-free form of "base rows with
   * at least one matching related row". Same-alias refs within one
   * AND-node share ONE subquery (a single related row must satisfy
   * all of them); refs inside `$or` branches become branch-local
   * EXISTS. Pure: shares unchanged subtrees, never mutates — the
   * caller's original tree stays valid for join-based plans. */
  private __liftToExists(
    node: unknown,
    aliases: ReadonlySet<string>,
  ): unknown {
    if (node === null || node === undefined || node instanceof Date) {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((n) => this.__liftToExists(n, aliases));
    }
    if (typeof node !== 'object') return node;
    const reverseEntries = this._runtime.reverseMap.get(this._compiled.key)!;
    const out: Row = {};
    const perAlias = new Map<string, Row>();
    for (const [key, value] of Object.entries(node as Row)) {
      if (key.startsWith('@')) {
        const stripped = key.slice(1);
        const dotIdx = stripped.indexOf('.@');
        if (dotIdx !== -1) {
          const alias = stripped.slice(0, dotIdx);
          if (aliases.has(alias)) {
            // `_prepareWhere` already digest-rewrote the key/value —
            // only the alias prefix is stripped for the sub-scope.
            const sub = perAlias.get(alias) ?? {};
            sub[`@${stripped.slice(dotIdx + 2)}`] = value;
            perAlias.set(alias, sub);
            continue;
          }
        }
        out[key] = value; // local/joined refs: values are leaves
        continue;
      }
      out[key] = this.__liftToExists(value, aliases); // $and/$or/$not…
    }
    if (perAlias.size === 0) return out;
    const existsNodes: Row[] = [];
    for (const [alias, sub] of perAlias) {
      const rel = reverseEntries.get(alias)!;
      const on: Record<string, string> = {};
      for (const [targetCol, sourceCol] of Object.entries(rel.on)) {
        on[`@${sourceCol}`] = `@${targetCol}`;
      }
      existsNodes.push({
        table: rel.sourceTableName,
        ...(rel.sourceDbSchema !== undefined
          ? { schema: rel.sourceDbSchema }
          : {}),
        on,
        ...(Object.keys(sub).length > 0 ? { where: sub } : {}),
      });
    }
    if (existsNodes.length === 1 && out['$exists'] === undefined) {
      out['$exists'] = existsNodes[0];
    } else {
      const and = Array.isArray(out['$and']) ? out['$and'] as unknown[] : [];
      out['$and'] = [...and, ...existsNodes.map((e) => ({ $exists: e }))];
    }
    return out;
  }

  /** JSON-parse relation values that came back as strings. */
  protected _parseJoinJson(rows: Row[], plan: ProjectionPlan): void {
    for (const row of rows) {
      for (const rel of plan.relations) {
        const raw = row[rel.outputKey];
        if (typeof raw === 'string') {
          try {
            row[rel.outputKey] = JSON.parse(raw);
          } catch {
            // Leave the raw string in place — caller can decode it.
          }
        }
      }
    }
  }

  /** Best-effort primary key of a read row, for a `decryptError` event /
   * `NormCryptoError`. A projection may omit the pk (→ `undefined`); the
   * pk is never encrypted, so it is safe to surface. */
  private __rowPk(row: Row): unknown {
    const pks = (this._compiled.def as { primaryKeys?: readonly string[] })
      .primaryKeys ?? [];
    if (pks.length === 0) return undefined;
    if (pks.length === 1) return row[pks[0]!];
    const out: Record<string, unknown> = {};
    for (const k of pks) out[k] = row[k];
    return out;
  }

  /** Decrypt + decode ONE cell, honouring `onDecryptFailure` — delegates
   * to the shared {@link decryptCell} kernel (same policy path as
   * `Norm.query()`). */
  private async __decryptCell(
    value: string,
    logicalType: string,
    column: string,
    pk: unknown,
  ): Promise<unknown> {
    return await decryptCell(
      this._runtime,
      this._compiled.key,
      this._requireSecret(),
      value,
      logicalType,
      column,
      pk,
    );
  }

  protected async _decryptRead(
    rows: Row[],
    plan: ProjectionPlan,
  ): Promise<void> {
    const runtime = this._runtime;
    if (runtime.encryptedFqn.size === 0) return;
    // Precompute the ENCRYPTED subset ONCE (mirrors the target-hoist in
    // _applyAfterReadTransforms): the full aliasMap / columnFqns are
    // walked per row otherwise, with an encryptedFqn lookup per column.
    const localTargets: Array<[string, string]> = []; // [outputKey, type]
    for (const [outputKey, fqn] of plan.aliasMap) {
      const logicalType = runtime.encryptedFqn.get(fqn);
      if (logicalType !== undefined) {
        localTargets.push([outputKey, logicalType]);
      }
    }
    const relTargets: Array<
      { outputKey: string; cols: Array<[string, string]> }
    > = [];
    for (const rel of plan.relations) {
      const cols: Array<[string, string]> = []; // [innerKey, type]
      for (const [innerKey, innerFqn] of Object.entries(rel.columnFqns)) {
        const innerType = runtime.encryptedFqn.get(innerFqn);
        if (innerType !== undefined) cols.push([innerKey, innerType]);
      }
      if (cols.length > 0) relTargets.push({ outputKey: rel.outputKey, cols });
    }
    if (localTargets.length === 0 && relTargets.length === 0) return;
    for (const row of rows) {
      const pk = this.__rowPk(row);
      for (const [outputKey, logicalType] of localTargets) {
        const value = row[outputKey];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string') continue;
        row[outputKey] = await this.__decryptCell(
          value,
          logicalType,
          outputKey,
          pk,
        );
      }
      for (const rt of relTargets) {
        const val = row[rt.outputKey];
        if (val === null || val === undefined) continue;
        const arr = Array.isArray(val) ? val : [val];
        for (const item of arr) {
          if (item === null || typeof item !== 'object') continue;
          const obj = item as Row;
          for (const [innerKey, innerType] of rt.cols) {
            const v = obj[innerKey];
            if (v === null || v === undefined) continue;
            if (typeof v !== 'string') continue;
            obj[innerKey] = await this.__decryptCell(
              v,
              innerType,
              `${rt.outputKey}.${innerKey}`,
              pk,
            );
          }
        }
      }
    }
  }

  /** Drop all-null LEFT-JOIN placeholders; unwrap belongsTo/hasOne to
   * object-or-null; keep hasMany as arrays. */
  protected _unwrapRelations(rows: Row[], plan: ProjectionPlan): void {
    for (const row of rows) {
      for (const rel of plan.relations) {
        const val = row[rel.outputKey];
        if (val === null || val === undefined) {
          row[rel.outputKey] = rel.cardinality === 'hasMany' ? [] : null;
          continue;
        }
        const arr = Array.isArray(val) ? val : [val];
        const filtered: Row[] = [];
        for (const item of arr) {
          if (item === null || item === undefined) continue;
          if (typeof item !== 'object') {
            filtered.push(item as unknown as Row);
            continue;
          }
          const obj = item as Row;
          const keys = Object.keys(obj);
          if (keys.length === 0) continue;
          if (keys.every((k) => obj[k] === null)) continue;
          filtered.push(obj);
        }
        if (rel.cardinality === 'hasMany') {
          row[rel.outputKey] = filtered;
        } else {
          row[rel.outputKey] = filtered[0] ?? null;
        }
      }
    }
  }

  /** afterRead COLUMN transforms on result rows, honoring projection
   * renames. Encrypted columns skipped when decryption was opted out. */
  protected _applyAfterReadTransforms(
    rows: Row[],
    plan: ProjectionPlan,
    decrypted: boolean,
  ): void {
    const c = this._compiled;
    if (c.afterRead.size === 0) return;
    const prefix = `${c.key}.`;
    const targets: Array<[string, (v: unknown) => unknown]> = [];
    for (const [outputKey, fqn] of plan.aliasMap) {
      if (!fqn.startsWith(prefix)) continue;
      const col = fqn.slice(prefix.length);
      if (!decrypted && c.localEncrypted.has(col)) continue;
      const fn = c.afterRead.get(col);
      if (fn !== undefined) targets.push([outputKey, fn]);
    }
    if (targets.length === 0) return;
    for (const row of rows) {
      for (const [key, fn] of targets) {
        const v = row[key];
        if (v === null || v === undefined) continue;
        row[key] = fn(v);
      }
    }
  }

  /** Apply a compiled entity's DEFAULT-shape masks to plain row
   * objects — the ONE kernel behind relation rows and RETURNING rows
   * (base rows go through the rename-capable plan.masks path in
   * {@linkcode _applyMasks}, which adds two-phase read protection).
   * Encrypted sources are skipped when the read is undecrypted; null
   * and undefined sources propagate as null. */
  protected _applyEntityMasks(
    c: CompiledEntity,
    rows: Row[],
    decrypted: boolean,
  ): void {
    if (c.maskedProjected.length === 0) return;
    for (const row of rows) {
      for (const m of c.maskedProjected) {
        const { source, fn } = c.masks.get(m)!;
        if (c.localEncrypted.has(source) && !decrypted) continue;
        const v = row[source];
        row[m] = v === null || v === undefined ? null : fn(v);
      }
    }
  }

  protected _applyMasks(
    rows: Row[],
    plan: ProjectionPlan,
    decrypted: boolean,
  ): void {
    if (plan.masks.length > 0) {
      const outputs = new Set(plan.masks.map((m) => m.outputKey));
      const strips = new Set<string>();
      for (const row of rows) {
        // Two-phase: read EVERY source before assigning ANY output —
        // a mask renamed onto a source key must not feed later masks
        // its own result.
        const sources = plan.masks.map((m) => row[m.sourceOut]);
        for (let i = 0; i < plan.masks.length; i++) {
          const m = plan.masks[i]!;
          if (m.sourceEncrypted && !decrypted) continue; // never ciphertext
          const v = sources[i];
          row[m.outputKey] = v === null || v === undefined ? null : m.fn(v);
        }
      }
      for (const m of plan.masks) {
        // A strip must never delete a key some mask just produced.
        if (m.strip && !outputs.has(m.sourceOut)) strips.add(m.sourceOut);
      }
      if (strips.size > 0) {
        for (const row of rows) {
          for (const s of strips) delete row[s];
        }
      }
    }
    if (plan.anchorStrips.length > 0) {
      for (const row of rows) {
        for (const s of plan.anchorStrips) delete row[s];
      }
    }
    for (const rel of plan.relations) {
      if (!rel.whole) continue; // sub-projections reject masks
      const target = this._runtime.compiled.get(rel.targetKey);
      if (target === undefined || target.maskedProjected.length === 0) {
        continue;
      }
      const stripSrcs: string[] = [];
      for (const m of target.maskedProjected) {
        const src = target.masks.get(m)!.source;
        if (!target.projectedColumns.includes(src)) stripSrcs.push(src);
      }
      for (const row of rows) {
        const val = row[rel.outputKey];
        if (val === null || val === undefined) continue;
        const items = (Array.isArray(val) ? val : [val]).filter(
          (item): item is Row => item !== null && typeof item === 'object',
        );
        this._applyEntityMasks(target, items, decrypted);
        for (const obj of items) {
          for (const s of stripSrcs) delete obj[s];
        }
      }
    }
  }

  /** afterRead ROW hook per row (replacement or in-place mutation). */
  protected async _runAfterReadHook(rows: Row[]): Promise<void> {
    const hook = (this._compiled.hooks as { afterRead?: unknown })?.afterRead;
    if (typeof hook !== 'function') return;
    for (let i = 0; i < rows.length; i++) {
      const replacement = await this._runHook(
        'afterRead',
        () => (hook as (row: Row) => Row | void)(rows[i]!),
      );
      if (replacement !== undefined) rows[i] = replacement as Row;
    }
  }

  /** Decrypt encrypted keys on FLAT rows (RETURNING / hash lookups). */
  protected async _decryptRows(rows: Row[]): Promise<Row[]> {
    const c = this._compiled;
    if (c.localEncrypted.size === 0) return rows;
    const specs = c.def.columns as Record<string, ColumnSpec>;
    for (const row of rows) {
      const pk = this.__rowPk(row);
      for (const key of c.localEncrypted) {
        const value = row[key];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string') continue;
        row[key] = await this.__decryptCell(value, specs[key]!.type, key, pk);
      }
    }
    return rows;
  }

  /** Resolve the encryption secret or throw a typed error. */
  protected _requireSecret(): string {
    const secret = this._runtime.crypto.secret;
    if (secret === undefined) {
      throw new NormCryptoError({
        entity: this._compiled.key,
        reason: 'missing-secret',
        operation: 'decrypt',
        code: 'MISSING_SECRET',
      });
    }
    return secret;
  }

  /** Emit the metadata-only `call` event on the shared runtime bus.
   * `id` is the SAME ULID returned in the operation's envelope, so
   * event-bus logs correlate 1:1 with caller-held results. */
  protected _emitCall(
    op: string,
    timeMs: number,
    isSlow: boolean,
    id: string,
  ): void {
    this._runtime.emit('call', this._compiled.key, op, timeMs, isSlow, id);
  }

  /** Run a hook callback, wrapping any throw as NormHookError. */
  protected async _runHook<T>(
    hook: 'beforeInsert' | 'beforeUpdate' | 'beforeDelete' | 'afterRead',
    fn: () => Promise<T> | T,
  ): Promise<T> {
    try {
      return await fn();
    } catch (cause) {
      throw new NormHookError(
        { model: this._compiled.key, hook },
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    }
  }
}

// =============================================================================
// Repo — the full DML surface (TABLE entities)
// =============================================================================

/**
 * Full read/write accessor for a TABLE entity — everything on
 * {@link ReadRepo} plus `insert` / `update` / `delete` / `upsert` /
 * `truncate` and their `*ByPK` variants. Writes run the generated
 * Guardian (validation), column transforms, and encryption before any
 * SQL. Obtained from `db.repo(key)`.
 */
export class Repo<
  R,
  Self extends keyof R & string,
  D extends AnyTableDef = Extract<R[Self], AnyTableDef>,
  /** Type-level scope: union of scoped column names, relaxing those
   * columns in `insert()`. `never` = unscoped. Runtime unaffected. */
  Scope extends string = never,
> extends ReadRepo<R, Self, D> {
  /** Fetch one row by primary key (composite keys: all columns). */
  public getByPK(
    pk: PrimaryKeyOf<D>,
    options?: { decrypt?: boolean },
  ): Promise<NormResult<DefaultRowOf<R, Self> | null>>;
  public getByPK<
    const P extends ProjectionInput & ValidProjection<R, Self, P>,
  >(
    pk: PrimaryKeyOf<D>,
    options: { project: P; decrypt?: boolean },
  ): Promise<NormResult<ProjectedRowOf<R, Self, P> | null>>;
  public async getByPK(
    pk: PrimaryKeyOf<D>,
    options: { project?: ProjectionInput; decrypt?: boolean } = {},
    // deno-lint-ignore no-explicit-any
  ): Promise<NormResult<any>> {
    const r = await (this.find as (
      f?: QueryFilter,
      o?: FindOptions,
    ) => Promise<NormResult<Row[]>>)(this._pkWhere(pk as Row), {
      limit: 1,
      decrypt: options.decrypt,
      project: options.project,
    });
    const row = r.data[0] ?? null;
    const out: NormResult<Row | null> = {
      ...r,
      data: row,
      count: row === null ? 0 : 1,
    };
    // deno-lint-ignore no-explicit-any
    return out as any;
  }

  /**
   * Insert one row or a batch; returns the inserted rows (decrypted,
   * with defaults/hooks applied and hidden columns stripped). Values
   * are validated, transformed, and encrypted before the SQL runs. On
   * a scoped handle, scoped columns are auto-filled and may be
   * omitted.
   *
   * @param data - One row, or an array for a batch insert.
   * @param opts - `decrypt: false` leaves ciphertext in the result.
   * @throws {@link NormValidationError} If a value fails its column rules.
   *
   * @example
   * ```typescript
   * const r = await db.repo('Users').insert({ email: 'a@b.c', name: 'A' });
   * r.data[0].id; // generated
   * ```
   */
  public async insert(
    data:
      | ScopedInsertOf<D, Scope>
      | ReadonlyArray<ScopedInsertOf<D, Scope>>,
    opts: { decrypt?: boolean } = {},
  ): Promise<NormResult<ReadRowOf<D>[]>> {
    const id = ulid();
    const isBatch = Array.isArray(data);
    const callerRows = isBatch ? [...(data as Row[])] : [data as Row];
    // Scope: a scoped insert must land IN the scope. Reject a payload
    // that contradicts the scope; auto-fill the value so callers
    // can't forget the tenant key. Insertable scope columns are set
    // PRE-validation (they flow through beforeWrite + WIN over the
    // column default); norm-owned ones are injected post-validation.
    const scopeApplied = this._scopeForOp();
    const c = this._compiled;
    if (scopeApplied !== null) {
      for (const row of callerRows) {
        for (const [col, value] of scopeApplied) {
          if (col in row && row[col] !== value) {
            throw new NormQueryError(
              `${c.key}.insert(): '${col}' is scope-bound to ` +
                `${JSON.stringify(value)} — a scoped insert cannot write ` +
                `a row into a different scope.`,
              { entity: c.key, subject: col, code: 'SCOPE_VIOLATION' },
            );
          }
          if (c.insertableColumns.has(col)) row[col] = value;
        }
      }
    }
    const rows = await this.__writeRows(callerRows, isBatch, 'insert');
    // Norm-owned (non-insertable) scope columns: inject post-validation,
    // routed through __encryptRow so an encrypted (.encrypt()/.hash())
    // scope column is stored as ciphertext WITH its digest sibling. A raw
    // assignment here would write the scope value as plaintext-at-rest and
    // leave the `<col>_hash` sibling NULL, so every scoped read (which
    // rewrites the scope to digest equality on that sibling) would then
    // silently miss the row it just wrote.
    if (scopeApplied !== null) {
      for (const row of rows) {
        const inject: Row = {};
        for (const [col, value] of scopeApplied) {
          if (!c.insertableColumns.has(col)) inject[col] = value;
        }
        if (Object.keys(inject).length > 0) {
          Object.assign(row, await this.__encryptRow(inject));
        }
      }
    }
    const q = {
      type: 'INSERT',
      ...this._irBase(),
      columns: this._compiled.columnNames,
      data: rows as never,
    } as Query<'INSERT'>;
    const res = await this._executor.execute<Row>(q);
    this._emitCall('INSERT', res.time, res.isSlow, id);
    const returned = await this.__finishReturning(
      res.data,
      opts.decrypt !== false,
    );
    return makeResult<ReadRowOf<D>[]>({
      id,
      op: 'INSERT',
      txId: this._txId,
      count: returned.length,
      time: res.time,
      isSlow: res.isSlow,
      scoped: this._scopedEnvelope(scopeApplied),
      data: returned,
    });
  }

  /**
   * Insert, or update the conflicting row(s) — INSERT … ON CONFLICT.
   * `conflictKeys` name the unique columns to match on; a digest
   * sibling is used automatically when a conflict key is encrypted
   * (an encrypted conflict key is rejected — ciphertext never matches
   * by value). `updateOnConflict` limits which columns the update
   * touches; a hash sibling re-syncs with its source.
   *
   * On a scoped handle upsert enforces the scope exactly like
   * {@link insert} / {@link update}: scoped columns are auto-filled
   * (and may be omitted), a payload that contradicts the active scope is
   * rejected, and — the part that is specific to upsert — the write can
   * never adopt or overwrite another scope's row. That last guarantee is
   * enforced on EVERY dialect by a pre-flight probe: before the
   * statement runs, upsert asks the database whether any row the INSERT
   * could collide with (the conflict target plus the entity's declared
   * PRIMARY KEY / `unique` groups) lives outside the active scope, and
   * refuses with `SCOPE_VIOLATION` if one does. This probe is ONE EXTRA
   * `SELECT` round-trip on every scoped upsert (skipped only when the
   * payload supplies no comparable candidate key — see
   * {@link __assertUpsertInScope}); it is a check-then-act, so a row a
   * different scope inserts in the window between probe and statement is
   * not caught. The ON CONFLICT target additionally carries the scope
   * columns when — and only when — the entity DECLARES a unique group
   * covering scope + `conflictKeys` (Postgres/SQLite reject an inference
   * list that matches no index, so folding unconditionally would break
   * ordinary upserts); that folded shape also closes the check-then-act
   * window at the schema level. The applied scope rides `result.scoped`.
   *
   * @param data - One row or a batch.
   * @param opts - `conflictKeys` (required), `updateOnConflict`, `decrypt`.
   * @throws {@link NormQueryError} If a conflict key is encrypted, a
   *   payload value contradicts the active `db.scope(...)`, or the
   *   write would collide with a row outside that scope.
   * @throws {@link NormValidationError} If a value fails its column rules.
   */
  public async upsert(
    // Scoped-relaxed like insert(): on a `db.scope(...)` handle the
    // scope columns are auto-filled, so requiring them in the payload
    // type made the DOCUMENTED "you may omit it" call a compile error.
    data:
      | ScopedInsertOf<D, Scope>
      | ReadonlyArray<ScopedInsertOf<D, Scope>>,
    opts: {
      conflictKeys: ReadonlyArray<keyof D['columns'] & string>;
      updateOnConflict?: ReadonlyArray<keyof D['columns'] & string>;
      decrypt?: boolean;
    },
  ): Promise<NormResult<ReadRowOf<D>[]>> {
    const id = ulid();
    const c = this._compiled;
    // Ciphertext is IV-randomized — an encrypted conflict key can
    // never match an existing row by value; the upsert would silently
    // duplicate or fail with a confusing dialect error.
    for (
      const key of [
        ...opts.conflictKeys,
        ...(opts.updateOnConflict ?? []),
      ]
    ) {
      if (c.masks.has(key)) {
        throw new NormQueryError(
          `Column '${key}' on entity '${c.key}' is a virtual mask — it ` +
            `does not exist in the database and cannot appear in ` +
            `conflictKeys/updateOnConflict.`,
          { entity: c.key, subject: key, code: 'UPSERT_CONFLICT_KEY' },
        );
      }
    }
    for (const key of opts.conflictKeys) {
      if (c.localEncrypted.has(key)) {
        throw new NormQueryError(
          `Column '${key}' on entity '${c.key}' cannot be an upsert ` +
            `conflict key — ciphertext is nondeterministic. Use the ` +
            `'${key}_hash' sibling (declare .hash()) instead.`,
          { entity: c.key, subject: key, code: 'UPSERT_CONFLICT_KEY' },
        );
      }
    }
    const isBatch = Array.isArray(data);
    const callerRows = isBatch ? [...(data as Row[])] : [data as Row];
    // Scope parity with insert(): a scoped upsert must land IN the scope.
    // Without this, upsert() is a silent cross-tenant write hole on a
    // scoped handle — every other write method (insert/update/delete)
    // enforces scope, but upsert never did. Reject a payload that
    // contradicts the scope and auto-fill insertable scope columns
    // pre-validation (norm-owned ones are injected post-validation
    // below); the applicable scope is also folded into the ON CONFLICT
    // target further down, so a conflict can only match within scope.
    const scopeApplied = this._scopeForOp();
    if (scopeApplied !== null) {
      for (const row of callerRows) {
        for (const [col, value] of scopeApplied) {
          if (col in row && row[col] !== value) {
            throw new NormQueryError(
              `${c.key}.upsert(): '${col}' is scope-bound to ` +
                `${JSON.stringify(value)} — a scoped upsert cannot write ` +
                `a row into a different scope.`,
              { entity: c.key, subject: col, code: 'SCOPE_VIOLATION' },
            );
          }
          if (c.insertableColumns.has(col)) row[col] = value;
        }
      }
    }
    const rows = await this.__writeRows(callerRows, isBatch, 'upsert');
    // Norm-owned (non-insertable) scope columns: inject post-validation,
    // routed through __encryptRow (same as insert()) so an encrypted
    // scope column stores ciphertext + its digest sibling, never
    // plaintext.
    if (scopeApplied !== null) {
      for (const row of rows) {
        const inject: Row = {};
        for (const [col, value] of scopeApplied) {
          if (!c.insertableColumns.has(col)) inject[col] = value;
        }
        if (Object.keys(inject).length > 0) {
          Object.assign(row, await this.__encryptRow(inject));
        }
      }
    }
    // Conflict-updating an encrypted column must also update its
    // norm-owned hash sibling, or the digest desyncs from the new
    // ciphertext and findByHash misses the row.
    let updateOnConflict = opts.updateOnConflict as string[] | undefined;
    if (updateOnConflict !== undefined) {
      const expanded = [...updateOnConflict];
      for (const col of updateOnConflict) {
        const sibling = c.hashSiblings.get(col);
        if (sibling === undefined || expanded.includes(sibling)) continue;
        const withSibling = rows.filter((r) => r[sibling] !== undefined);
        if (withSibling.length === rows.length) {
          expanded.push(sibling);
        } else if (withSibling.length > 0) {
          // Silently skipping the sibling would desync digests for the
          // rows that DID carry a new value — refuse loudly instead.
          throw new NormQueryError(
            `upsert batch on '${c.key}' mixes rows with and without ` +
              `'${col}' while updateOnConflict includes it — the hash ` +
              `sibling cannot be updated uniformly. Split the batch.`,
            { entity: c.key, subject: col, code: 'UPSERT_CONFLICT_KEY' },
          );
        }
      }
      updateOnConflict = expanded;
    }
    // Scoped conflict matching. Two mechanisms, deliberately separate:
    //
    // 1. TARGET FOLD (opportunistic, Postgres/SQLite/Mongo). Prepending
    //    the scope column to the ON CONFLICT list makes a conflict
    //    detectable only WITHIN the scope — but Postgres and SQLite
    //    infer the arbiter index from that list and reject it outright
    //    (42P10 / "does not match any PRIMARY KEY or UNIQUE
    //    constraint") unless a real index covers exactly those columns.
    //    Folding unconditionally therefore broke every ordinary scoped
    //    upsert (`conflictKeys: ['id']` against the PK included), so the
    //    fold now happens ONLY when the entity DECLARES a unique group
    //    (or a PK) covering scope + conflictKeys — the multi-tenant
    //    schema shape that makes the folded list legal SQL. Nothing is
    //    folded otherwise: the emitted target stays exactly what the
    //    caller asked for.
    // 2. SCOPE PROBE (the actual guarantee, ALL dialects). The fold can
    //    never carry the guarantee on its own: MariaDB's
    //    ON DUPLICATE KEY UPDATE ignores the conflict target entirely
    //    and matches on ANY unique key, so a folded target buys zero
    //    isolation there. Before the statement runs, __assertUpsertInScope
    //    asks the database whether any row this INSERT could collide
    //    with lives outside the scope, and refuses if one does.
    //
    // An encrypted scope column matches via its digest sibling in both,
    // mirroring the scoped read path.
    let conflictCols: string[] = [...(opts.conflictKeys as string[])];
    if (scopeApplied !== null) {
      const scopeMatchCols: string[] = [];
      for (const col of scopeApplied.keys()) {
        let matchCol = col;
        if (c.localEncrypted.has(col)) {
          const sibling = c.hashSiblings.get(col);
          if (sibling === undefined) {
            // Same reason the scoped READ path rejects this column: a
            // random-IV ciphertext never compares equal, so the scope
            // cannot be matched at all. Refusing beats "verifying"
            // against a value that can never match.
            throw new NormQueryError(
              `${c.key}.upsert(): scope column '${col}' is encrypted ` +
                `without a .hash() sibling — ciphertext is ` +
                `nondeterministic, so a scoped upsert cannot prove the ` +
                `write stays inside the scope. Declare .hash() on it.`,
              { entity: c.key, subject: col, code: 'SCOPE_VIOLATION' },
            );
          }
          matchCol = sibling;
        }
        if (!scopeMatchCols.includes(matchCol)) scopeMatchCols.push(matchCol);
      }
      // The caller may have scoped the target themselves.
      let scopedTarget = scopeMatchCols.every((s) => conflictCols.includes(s));
      if (!scopedTarget) {
        const folded = [
          ...scopeMatchCols.filter((s) => !conflictCols.includes(s)),
          ...conflictCols,
        ];
        if (this.__hasDeclaredKeySet(folded)) {
          conflictCols = folded;
          scopedTarget = true;
        }
      }
      await this.__assertUpsertInScope(
        rows,
        conflictCols,
        scopedTarget,
        scopeMatchCols,
        id,
      );
    }
    const q = {
      type: 'UPSERT',
      ...this._irBase(),
      columns: this._compiled.columnNames,
      data: rows as never,
      conflictKeys: conflictCols.map((k) => `@${k}` as const),
      ...(updateOnConflict
        ? { updateOnConflict: updateOnConflict.map((k) => `@${k}`) }
        : {}),
    } as Query<'UPSERT'>;
    const res = await this._executor.execute<Row>(q);
    this._emitCall('UPSERT', res.time, res.isSlow, id);
    const returned = await this.__finishReturning(
      res.data,
      opts.decrypt !== false,
    );
    return makeResult<ReadRowOf<D>[]>({
      id,
      op: 'UPSERT',
      txId: this._txId,
      count: returned.length,
      time: res.time,
      isSlow: res.isSlow,
      scoped: this._scopedEnvelope(scopeApplied),
      data: returned,
    });
  }

  /** Update matching rows; OMITTING the filter updates ALL rows
   * (warned). Hashed columns filter by plaintext equality. */
  public async update(
    data: UpdateOf<D>,
    filter?: FilterOf<R, Self>,
  ): Promise<NormResult> {
    const id = ulid();
    let where: QueryFilter | undefined;
    if (filter === undefined) {
      this._runtime.emit(
        'warning',
        this._compiled.key,
        'UPDATE',
        'all-rows-update',
        `${this._compiled.key}.update() called without a filter — ` +
          `updating ALL rows. Pass {} to silence this warning.`,
      );
    } else if (Object.keys(filter as Row).length === 0) {
      // Explicit {} = deliberate all-rows update; no warning.
    } else {
      where = await this._prepareWhere(filter as Row);
    }
    // beforeUpdate row hook.
    let row = (data as Row) ?? {};
    const hook = (this._compiled.hooks as { beforeUpdate?: unknown })
      ?.beforeUpdate;
    if (typeof hook === 'function') {
      const replacement = await this._runHook(
        'beforeUpdate',
        () => (hook as (r: Row) => Row | void)(row),
      );
      if (replacement !== undefined) row = replacement as Row;
    }
    // Scope: enforce on the WHERE (only in-scope rows update) and
    // REJECT a payload that would move a row out of scope — the SET
    // clause may only carry the scope column if it equals the scope
    // value (caveat: only checked when the caller passes the key).
    const scopeApplied = this._scopeForOp();
    if (scopeApplied !== null) {
      for (const [col, value] of scopeApplied) {
        if (col in row && row[col] !== value) {
          throw new NormQueryError(
            `${this._compiled.key}.update(): '${col}' is scope-bound to ` +
              `${JSON.stringify(value)} — a scoped update cannot move a ` +
              `row to a different scope.`,
            {
              entity: this._compiled.key,
              subject: col,
              code: 'SCOPE_VIOLATION',
            },
          );
        }
      }
    }
    where = await this._mergeScopeWhere(where, scopeApplied);
    // Transforms → validate (guardian fills defaultOnUpdate) →
    // post-validation defaults → encrypt.
    const [ready] = await this.__prepareValidated([row], false, 'update');
    const q = {
      type: 'UPDATE',
      ...this._irBase(),
      columns: this._compiled.columnNames,
      data: ready as never,
      ...(where !== undefined ? { where } : {}),
    } as Query<'UPDATE'>;
    const res = await this._executor.execute<Row>(q);
    this._emitCall('UPDATE', res.time, res.isSlow, id);
    return makeResult({
      id,
      op: 'UPDATE',
      txId: this._txId,
      count: coerceCount(res.count),
      time: res.time,
      isSlow: res.isSlow,
      scoped: this._scopedEnvelope(scopeApplied),
    });
  }

  /** Update the single row with this primary key. Equivalent to
   * `update(data, pkFilter)`; composite keys pass every pk column. */
  public updateByPK(
    data: UpdateOf<D>,
    pk: PrimaryKeyOf<D>,
  ): Promise<NormResult> {
    return this.update(data, this._pkWhere(pk as Row) as FilterOf<R, Self>);
  }

  /** Delete matching rows; OMITTING the filter deletes ALL rows
   * (warned). */
  public async delete(filter?: FilterOf<R, Self>): Promise<NormResult> {
    const id = ulid();
    let where: QueryFilter | undefined;
    if (filter === undefined) {
      this._runtime.emit(
        'warning',
        this._compiled.key,
        'DELETE',
        'all-rows-delete',
        `${this._compiled.key}.delete() called without a filter — ` +
          `deleting ALL rows. Pass {} to silence this warning.`,
      );
    } else if (Object.keys(filter as Row).length === 0) {
      // Explicit {} = deliberate all-rows delete; no warning.
    } else {
      where = await this._prepareWhere(filter as Row);
    }
    // beforeDelete row hook: sees the caller's filter (deletes fetch
    // no rows); throwing vetoes the delete.
    const hook = (this._compiled.hooks as { beforeDelete?: unknown })
      ?.beforeDelete;
    if (typeof hook === 'function') {
      await this._runHook(
        'beforeDelete',
        () =>
          (hook as (f: Row | undefined) => void | Promise<void>)(
            filter as Row | undefined,
          ),
      );
    }
    const scopeApplied = this._scopeForOp();
    where = await this._mergeScopeWhere(where, scopeApplied);
    const q = {
      type: 'DELETE',
      ...this._irBase(),
      columns: this._compiled.columnNames,
      ...(where !== undefined ? { where } : {}),
    } as Query<'DELETE'>;
    const res = await this._executor.execute<Row>(q);
    this._emitCall('DELETE', res.time, res.isSlow, id);
    return makeResult({
      id,
      op: 'DELETE',
      txId: this._txId,
      count: coerceCount(res.count),
      time: res.time,
      isSlow: res.isSlow,
      scoped: this._scopedEnvelope(scopeApplied),
    });
  }

  /** Delete the single row with this primary key. Fires the
   * `beforeDelete` hook with the pk filter, like {@link delete}. */
  public deleteByPK(pk: PrimaryKeyOf<D>): Promise<NormResult> {
    return this.delete(this._pkWhere(pk as Row) as FilterOf<R, Self>);
  }

  /**
   * Empty the table. `cascade: true` also truncates tables with FKs
   * referencing this one (where the dialect supports it). Resets
   * identity sequences; no hooks fire.
   *
   * On a scoped handle this REFUSES: TRUNCATE cannot carry a scope
   * filter, so honouring it would empty every scope's rows — use
   * `delete({})` (which IS scoped) to clear only this scope, or an
   * unscoped handle for a true table truncate.
   *
   * @throws {@link NormQueryError} If called on a scoped handle.
   */
  public async truncate(opts: { cascade?: boolean } = {}): Promise<NormResult> {
    const id = ulid();
    // A scoped handle promises "every read and write is confined to the
    // scope" — but TRUNCATE takes no WHERE, so it would silently destroy
    // EVERY scope's rows, not just this one. Refuse rather than perform
    // an unscopeable, irreversible cross-scope wipe (delete({}) stays the
    // scoped bulk-clear path). Scope that does not apply to THIS entity
    // (_scopeForOp() === null) is not a scoped handle for it — allow.
    const scopeApplied = this._scopeForOp();
    if (scopeApplied !== null) {
      throw new NormQueryError(
        `${this._compiled.key}.truncate() cannot run on a scoped handle — ` +
          `TRUNCATE carries no scope filter and would empty EVERY scope's ` +
          `rows, not just this one. Use delete({}) to clear only this ` +
          `scope's rows, or call truncate() on an unscoped handle.`,
        { entity: this._compiled.key, code: 'SCOPE_VIOLATION' },
      );
    }
    const q = {
      type: 'TRUNCATE',
      ...this._irBase(),
      ...(opts.cascade ? { cascade: true } : {}),
    } as Query<'TRUNCATE'> as ExecutorQuery;
    const res = await this._executor.execute<Row>(q);
    this._emitCall('TRUNCATE', res.time, res.isSlow, id);
    return makeResult({
      id,
      op: 'TRUNCATE',
      txId: this._txId,
      count: 0,
      time: res.time,
      isSlow: res.isSlow,
    });
  }

  // findByHash was deliberately REMOVED: hashed columns filter
  // transparently — `find({ '@email': plaintext })` rewrites to
  // digest equality on the sibling, with the same beforeWrite
  // normalization the write path applies (and composes with $or,
  // joins, update()/delete() filters — which the method never did).

  // ───────────────────────────────────────────────────────────────────
  // Write helpers
  // ───────────────────────────────────────────────────────────────────

  /**
   * Every unique key set the entity DECLARES — the primary key plus
   * each `unique: { … }` group. This is exactly what NORM can reason
   * about without introspecting the live database, and (because the
   * Migrator owns the schema from these same declarations) what a
   * norm-managed database actually carries.
   */
  private __declaredKeySets(): string[][] {
    const def = this._compiled.def as {
      primaryKeys?: readonly string[];
      uniques?: Record<string, readonly string[]>;
    };
    const out: string[][] = [];
    if (def.primaryKeys !== undefined && def.primaryKeys.length > 0) {
      out.push([...def.primaryKeys]);
    }
    for (const cols of Object.values(def.uniques ?? {})) {
      if (cols.length > 0) out.push([...cols]);
    }
    return out;
  }

  /** True when a declared key set covers EXACTLY `cols` (order- and
   * duplicate-insensitive) — i.e. an index the engine can infer an
   * `ON CONFLICT (cols)` arbiter from. */
  private __hasDeclaredKeySet(cols: ReadonlyArray<string>): boolean {
    const want = new Set(cols);
    return this.__declaredKeySets().some((set) =>
      set.length === want.size && set.every((col) => want.has(col))
    );
  }

  /**
   * Pre-flight scope guard for a scoped upsert — the dialect-independent
   * half of scoped conflict matching.
   *
   * The ON CONFLICT target cannot carry the isolation guarantee by
   * itself: Postgres/SQLite only honour a target that matches a real
   * index, and MariaDB's `ON DUPLICATE KEY UPDATE` ignores the target
   * altogether and matches on ANY unique key of the table. So before the
   * statement runs we ask the database directly: does a row this INSERT
   * could collide with live OUTSIDE the active scope? Collision
   * candidates are the effective conflict target (only while it is NOT
   * already scope-covered — a scoped target can only ever match in
   * scope) plus every DECLARED unique group / primary key that the
   * payload fully supplies, which is precisely the set MariaDB would
   * match on. Sets that contain the whole scope are skipped: matching
   * them is in-scope by construction.
   *
   * The comparison runs IN the database (`scopeCol <> value OR
   * scopeCol IS NULL`), never in JS, so dialect readback coercion
   * cannot produce a false accusation. Only existence is fetched —
   * no other scope's data is read back.
   *
   * Cost: this is ONE EXTRA `SELECT` round-trip on every scoped upsert
   * that reaches it (a scoped upsert is therefore probe + write, two
   * statements, where an unscoped one is a single write). It returns
   * early — no query — only when the payload gives it nothing to check:
   * every candidate key set is either wholly inside the scope (skipped
   * above) or has no row supplying comparable (defined, non-NULL,
   * non-expression) values. It still fires on the recommended per-scope
   * UNIQUE shape whenever the payload also carries a primary key or other
   * declared key the engine could match on. A single-column key folds the
   * whole batch into one `$in`; a composite key contributes one `AND`
   * group per row, so the probe predicate grows with batch size.
   *
   * Concurrency: this is a check-then-act, so a row inserted by another
   * scope between the probe and the statement is NOT caught. The write
   * then proceeds and — per the target's own matching rules — may
   * overwrite the racing row, or, when the conflict key is globally
   * unique and the engine matches on it alone (e.g. a document store, or
   * MariaDB's any-unique-key match), adopt it into the active scope by
   * setting the auto-filled scope value onto it. A per-scope UNIQUE —
   * which also lets the target fold — closes that window at the schema
   * level and is the only way to get atomic isolation here.
   *
   * @throws {@link NormQueryError} `SCOPE_VIOLATION` when a conflicting
   *   row lives outside the active scope.
   */
  private async __assertUpsertInScope(
    rows: Row[],
    conflictCols: ReadonlyArray<string>,
    scopedTarget: boolean,
    scopeMatchCols: ReadonlyArray<string>,
    id: string,
  ): Promise<void> {
    const c = this._compiled;
    const candidates: string[][] = [];
    const addCandidate = (cols: ReadonlyArray<string>): void => {
      if (cols.length === 0) return;
      // Contains the whole scope → can only match in scope.
      if (scopeMatchCols.every((s) => cols.includes(s))) return;
      const dup = candidates.some((k) =>
        k.length === cols.length && k.every((x) => cols.includes(x))
      );
      if (!dup) candidates.push([...cols]);
    };
    if (!scopedTarget) addCandidate(conflictCols);
    for (const set of this.__declaredKeySets()) addCandidate(set);
    if (candidates.length === 0) return;

    // A key column that is NULL or DB-evaluated (expression marker)
    // cannot be compared here: NULLs never collide in a unique index,
    // and an expression's value is not known until the engine runs it.
    const usable = (cols: string[]) =>
      rows.filter((r) =>
        cols.every((col) => {
          const v = r[col];
          return v !== undefined && v !== null && !isExpressionValue(v);
        })
      );
    const matches: Row[] = [];
    for (const cols of candidates) {
      const hits = usable(cols);
      if (hits.length === 0) continue;
      if (cols.length === 1) {
        // Single-column key: one `$in` covers the whole batch.
        const col = cols[0]!;
        const values = [...new Set(hits.map((r) => r[col]))];
        matches.push({
          [`@${col}`]: values.length === 1
            ? { $eq: values[0] }
            : { $in: values },
        });
      } else {
        for (const r of hits) {
          const bag: Row = {};
          for (const col of cols) bag[`@${col}`] = { $eq: r[col] };
          matches.push(bag);
        }
      }
    }
    if (matches.length === 0) return;

    // "Outside the scope" = any scope column differing from the value
    // this write carries. `<> value` is UNKNOWN for a NULL row, so the
    // IS NULL arm is required to catch scope-less rows.
    const outOfScope: Row[] = [];
    for (const col of scopeMatchCols) {
      const value = rows[0]?.[col];
      if (value === undefined || isExpressionValue(value)) continue;
      if (value === null) {
        outOfScope.push({ [`@${col}`]: { $null: false } });
      } else {
        outOfScope.push({ [`@${col}`]: { $ne: value } });
        outOfScope.push({ [`@${col}`]: { $null: true } });
      }
    }
    if (outOfScope.length === 0) return;

    const q = {
      type: 'SELECT',
      ...this._irBase(),
      columns: c.columnNames,
      projection: Object.fromEntries(
        scopeMatchCols.map((col) => [`@${col}`, true]),
      ),
      where: {
        $and: [
          matches.length === 1 ? matches[0]! : { $or: matches },
          outOfScope.length === 1 ? outOfScope[0]! : { $or: outOfScope },
        ],
      },
      limit: 1,
    } as NormDMLQuery;
    const res = await this._executor.execute<Row>(q);
    this._emitCall('SELECT', res.time, res.isSlow, id);
    if (res.data.length === 0) return;
    const scopeList = scopeMatchCols.map((s) => `'${s}'`).join(', ');
    throw new NormQueryError(
      `${c.key}.upsert(): the write would conflict with a row OUTSIDE ` +
        `the active scope (${scopeList}) — a scoped upsert must never ` +
        `adopt or overwrite another scope's row. Declare a per-scope ` +
        `UNIQUE covering (${scopeList}, ` +
        `${conflictCols.map((k) => `'${k}'`).join(', ')}) so conflicts ` +
        `can only match within the scope, use a conflict key that is ` +
        `unique per scope, or run the upsert on an unscoped handle.`,
      { entity: c.key, code: 'SCOPE_VIOLATION' },
    );
  }

  /** Insert/upsert write pipeline up to (and including) encryption. */
  private async __writeRows(
    payload: Row[],
    isBatch: boolean,
    op: 'insert' | 'upsert',
  ): Promise<Row[]> {
    // beforeInsert row hook, per row.
    const hook = (this._compiled.hooks as { beforeInsert?: unknown })
      ?.beforeInsert;
    if (typeof hook === 'function') {
      for (let i = 0; i < payload.length; i++) {
        const replacement = await this._runHook(
          'beforeInsert',
          () => (hook as (r: Row) => Row | void)(payload[i]!),
        );
        if (replacement !== undefined) payload[i] = replacement as Row;
      }
    }
    return await this.__prepareValidated(payload, isBatch, op);
  }

  /**
   * Shared write steps: beforeWrite column transforms → strip
   * caller-supplied expression markers from the validation view →
   * GENERATED-GUARDIAN validation (returns parsed rows with declared
   * defaults filled) → merge markers back + post-validation defaults
   * (expressions + scope-excluded system columns) → encrypt + hash.
   */
  private async __prepareValidated(
    payload: Row[],
    isBatch: boolean,
    op: 'insert' | 'upsert' | 'update',
  ): Promise<Row[]> {
    const c = this._compiled;

    // beforeWrite transforms (present values only; markers skipped).
    const transformed = payload.map((row) => {
      if (c.beforeWrite.size === 0) return row;
      let out = row;
      for (const [col, fn] of c.beforeWrite) {
        const v = out[col];
        if (v === null || v === undefined) continue;
        if (isExpressionValue(v)) continue;
        if (out === row) out = { ...row };
        out[col] = fn(v);
      }
      return out;
    });

    // Prepare validation views. Two jobs per row:
    // 1. DROP explicit-undefined keys — "not provided" must never
    //    become SET NULL (the guardian's optional handler would pass
    //    undefined through to the IR).
    // 2. Extract caller-supplied expression markers (DB-evaluated —
    //    the Guardian validates JS values only). Markers BYPASS the
    //    strict guardian, so its shape rules are re-imposed here:
    //    only guardian-included (in-scope, declared, non-norm-owned)
    //    columns may carry one, and NEVER an encrypted column (the
    //    database would compute and store plaintext, skipping the
    //    hash sibling).
    // (Guardian itself fills `.optional(default)` for ABSENT keys —
    // upstream ObjectGuardian fix — so no seeding is needed here.)
    const writable = op === 'update' ? c.updatableColumns : c.insertableColumns;
    const markers: Array<Row | undefined> = [];
    const presentKeys: Array<Set<string>> = [];
    const markerIssues: ValidationIssue[] = [];
    const views = transformed.map((row, i) => {
      let extracted: Row | undefined;
      let view = row;
      const ensureCopy = () => {
        if (view === row) view = { ...row };
      };
      for (const [k, v] of Object.entries(row)) {
        if (v === undefined) {
          ensureCopy();
          delete view[k];
          continue;
        }
        if (!isExpressionValue(v)) continue;
        const prefix = isBatch ? `[${i}].` : '';
        if (!writable.has(k)) {
          markerIssues.push({
            model: c.key,
            op,
            path: prefix + k,
            message:
              `expression value on unknown or out-of-scope column '${k}'`,
          });
        } else if (c.localEncrypted.has(k)) {
          markerIssues.push({
            model: c.key,
            op,
            path: prefix + k,
            message:
              `expression values are evaluated by the database and would ` +
              `bypass encryption, storing plaintext — use a literal or a ` +
              `local generator instead`,
          });
        }
        extracted ??= {};
        extracted[k] = v;
        ensureCopy();
        delete view[k];
      }
      markers.push(extracted);
      // Which columns the CALLER actually supplied (post-transform) —
      // system-filled values are normalized separately below.
      presentKeys.push(
        new Set(Object.keys(view).filter((k) => view[k] !== undefined)),
      );
      return view;
    });
    if (markerIssues.length > 0) {
      throw new NormValidationError({ issues: markerIssues });
    }

    // Guardian validation — parsed output carries the declared
    // defaults (.optional(default)) for in-scope columns.
    const parsed = validateRows(
      c.guardians![op === 'update' ? 'update' : 'insert'],
      views,
      { model: c.key, op },
      isBatch,
    );

    // Merge markers back + post-validation defaults (expression
    // defaults and scope-excluded system defaults), normalize
    // system-filled values through beforeWrite, then encrypt.
    const postDefaults = op === 'update'
      ? c.postUpdateDefaults
      : c.postInsertDefaults;
    const out: Row[] = [];
    for (let i = 0; i < parsed.length; i++) {
      let row = parsed[i]!;
      if (markers[i] !== undefined) row = { ...row, ...markers[i] };
      for (const [col, d] of postDefaults) {
        if (row[col] !== undefined) continue;
        row[col] = typeof d === 'function' ? (d as () => unknown)() : d;
      }
      // Guardian-filled and post-injected defaults never saw the
      // caller-payload beforeWrite pass — normalize them now, or the
      // stored plaintext/hash sibling of a defaulted value would
      // diverge from an identical explicitly-written value (and
      // findByHash would silently miss defaulted rows).
      if (c.beforeWrite.size > 0) {
        const present = presentKeys[i]!;
        for (const [col, fn] of c.beforeWrite) {
          if (present.has(col)) continue;
          const v = row[col];
          if (v === null || v === undefined) continue;
          if (isExpressionValue(v)) continue;
          row[col] = fn(v);
        }
      }
      out.push(await this.__encryptRow(row));
    }
    return out;
  }

  /** Encrypt encrypted columns (canonicalized plaintext of ANY
   * logical type) + compute SHA-256 hash siblings + digest one-way
   * `Column.hash(algo)` columns in place. */
  private async __encryptRow(row: Row): Promise<Row> {
    const c = this._compiled;
    if (c.localEncrypted.size === 0 && c.digestColumns.size === 0) return row;
    const crypto = this._runtime.crypto;
    const out: Row = { ...row };
    const specs = c.def.columns as Record<string, ColumnSpec>;
    for (const name of c.localEncrypted) {
      const plain = out[name];
      if (plain === undefined) continue;
      if (plain === null) {
        // Clearing the column clears its hash sibling too — a stale
        // digest would match rows whose plaintext is gone.
        const hashCol = c.hashSiblings.get(name);
        if (hashCol !== undefined) out[hashCol] = null;
        continue;
      }
      if (isExpressionValue(plain)) {
        // Defense in depth — __prepareValidated rejects these before
        // they can reach this point.
        throw new Error(
          `Encrypted column '${name}' on entity '${c.key}' received an ` +
            `expression value — the database would store plaintext.`,
        );
      }
      // The Guardian already validated the logical type; this maps it
      // to the canonical string form encryption operates on.
      const canonical = canonicalizePlain(plain, specs[name]!.type);
      const secret = this._requireSecret();
      out[name] = await crypto.encrypt(canonical, secret, crypto.algorithm);
      const hashCol = c.hashSiblings.get(name);
      if (hashCol !== undefined) {
        out[hashCol] = await crypto.hash(canonical, SIBLING_HASH_ALGORITHM);
      }
    }
    for (const [name, algorithm] of c.digestColumns) {
      const plain = out[name];
      if (plain === undefined || plain === null) continue;
      if (isExpressionValue(plain)) {
        throw new Error(
          `Digest column '${name}' on entity '${c.key}' received an ` +
            `expression value — the database would store plaintext.`,
        );
      }
      const canonical = canonicalizePlain(plain, specs[name]!.type);
      out[name] = algorithm === 'PBKDF2'
        ? await crypto.pbkdf2Hash(canonical)
        : await crypto.hash(canonical, algorithm);
    }
    return out;
  }

  /** RETURNING pipeline: decrypt → masks → hidden strip → afterRead
   * column transforms → afterRead row hook. Masks compute from the
   * DECODED stored value (before the source's own afterRead — same
   * input as the read path) and survive the hidden strip even when
   * their source does not. */
  private async __finishReturning(
    rows: Row[],
    decrypt: boolean,
  ): Promise<ReadRowOf<D>[]> {
    const c = this._compiled;
    if (decrypt) rows = await this._decryptRows(rows);
    this._applyEntityMasks(c, rows, decrypt);
    if (c.returningStrip !== undefined) {
      for (const row of rows) {
        for (const col of c.returningStrip) delete row[col];
      }
    }
    if (c.afterRead.size > 0) {
      for (const row of rows) {
        for (const [col, fn] of c.afterRead) {
          if (!decrypt && c.localEncrypted.has(col)) continue;
          const v = row[col];
          if (v === null || v === undefined) continue;
          row[col] = fn(v);
        }
      }
    }
    await this._runAfterReadHook(rows);
    return rows as ReadRowOf<D>[];
  }

  /** Build a QueryFilter equating each PK column to its value. */
  protected _pkWhere(pk: Row): QueryFilter {
    const def = this._compiled.def as unknown as TableDefinition;
    const where: Record<`@${string}`, unknown> = {};
    for (const name of def.primaryKeys as readonly string[]) {
      where[`@${name}`] = pk[name];
    }
    return where as QueryFilter;
  }
}

// =============================================================================
// QueryAccessor — stored client-side SELECTs (QUERY entities)
// =============================================================================

/**
 * Accessor for a QUERY entity — a stored, client-side SELECT. Terminal
 * (not joinable): only pagination (`limit`/`offset`) may be overlaid,
 * and rows come back RAW (no decryption — a stored query has no column
 * provenance). The `afterRead` hook still runs. Obtained from
 * `db.repo(key)`.
 */
export class QueryAccessor<D extends AnyDef> {
  private readonly __compiled: CompiledEntity;
  private readonly __executor: Executor;
  private readonly __runtime: Runtime;
  private readonly __txId: string | undefined;

  /**
   * Internal — a `QueryAccessor` is returned by `db.query(...)`, not
   * constructed directly.
   * @param runtime - The compiled registry (shared).
   * @param compiled - The entity the stored query is bound to.
   * @param executor - The engine seam it re-issues the SELECT against.
   * @param txId - Set when the query runs inside a transaction.
   */
  public constructor(
    runtime: Runtime,
    compiled: CompiledEntity,
    executor: Executor,
    txId?: string,
  ) {
    this.__runtime = runtime;
    this.__compiled = compiled;
    this.__executor = executor;
    this.__txId = txId;
  }

  /** The definition this accessor is bound to. */
  public get definition(): D {
    return this.__compiled.def as unknown as D;
  }

  /**
   * Re-issue the stored SELECT, optionally overriding pagination.
   * Result rows come back RAW — stored queries lack column
   * provenance, so ciphertext is not decrypted. The afterRead row
   * hook still runs per row.
   */
  public async find(
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NormResult<RowOf<D>[]>> {
    const id = ulid();
    const base = (this.__compiled.def as unknown as QueryDefinition).query;
    // Caller override → stored IR's own limit → entity default (10);
    // 0 = UNBOUNDED with a warning event per read.
    const effLimit = opts.limit ?? base.limit ??
      (this.__compiled.def as { defaultPageSize?: number })
        .defaultPageSize ??
      10;
    if (effLimit === 0) {
      this.__runtime.emit(
        'warning',
        this.__compiled.key,
        'SELECT',
        'unbounded-read',
        `${this.__compiled.key}.find() running UNBOUNDED ` +
          `(defaultPageSize/limit 0) — fetches every row.`,
      );
    }
    const { limit: _baseLimit, ...baseSansLimit } = base;
    const q: Query<'SELECT'> = {
      ...baseSansLimit,
      ...(effLimit !== 0 ? { limit: effLimit } : {}),
      ...(typeof opts.offset === 'number' ? { offset: opts.offset } : {}),
    };
    const res = await this.__executor.execute<Row>(q);
    this.__runtime.emit(
      'call',
      this.__compiled.key,
      'SELECT',
      res.time,
      res.isSlow,
      id,
    );
    const rows = res.data;
    const hook = (this.__compiled.hooks as { afterRead?: unknown })
      ?.afterRead;
    if (typeof hook === 'function') {
      for (let i = 0; i < rows.length; i++) {
        try {
          // Awaited — an async hook must neither leak Promise objects
          // into rows nor bypass the NormHookError wrap on rejection.
          const replacement = await (hook as (
            row: Row,
          ) => Row | void | Promise<Row | void>)(rows[i]!);
          if (replacement !== undefined) rows[i] = replacement as Row;
        } catch (cause) {
          throw new NormHookError(
            { model: this.__compiled.key, hook: 'afterRead' },
            cause instanceof Error ? cause : new Error(String(cause)),
          );
        }
      }
    }
    return makeResult<RowOf<D>[]>({
      id,
      op: 'SELECT',
      txId: this.__txId,
      count: rows.length,
      time: res.time,
      isSlow: res.isSlow,
      data: rows as RowOf<D>[],
    });
  }
}

// =============================================================================
// Module-level helpers
// =============================================================================

/** Walk a filter/orderBy structure, invoking
 * `visit(alias, col, position)` for every `@<Alias>.@<col>` reference —
 * in KEY position (`{'@Author.@createdAt': ...}`) AND in VALUE position
 * (`{'@publishedAt': {$gt: '@Author.@createdAt'}}`, `$in` elements).
 * The filterable guard (`__walkFilterableRefs`) treats both positions
 * as column refs, so the join planner MUST plan a join for both or a
 * value-position cross-column filter passes the guard yet reaches the
 * translator with no join block (an opaque error, or silently-wrong
 * results on string-typed columns). The POSITION is reported because
 * the two are not interchangeable for an unprojected to-many alias:
 * a key-position ref lifts into a correlated `$exists`, a
 * value-position one cannot (see `visitAliasRef`). Recurses into every
 * value. */
function walkJoinRefs(
  obj: unknown,
  visit: (alias: string, col: string, position: 'key' | 'value') => void,
): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    // Value-position column ref (operator RHS / $in element).
    if (obj.startsWith('@')) visitJoinRef(obj.slice(1), 'value', visit);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walkJoinRefs(item, visit);
    return;
  }
  if (typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj as Row)) {
    // Key-position joined ref.
    if (k.startsWith('@')) visitJoinRef(k.slice(1), 'key', visit);
    // Recurse into EVERY value — operator bags, arrays, and string
    // values may all carry joined column refs.
    walkJoinRefs(v, visit);
  }
}

/** Emit `visit(alias, col, position)` for a stripped `@`-less
 * `Alias.@col` ref; a bare local-column ref (no `.@`) needs no join and
 * is ignored. */
function visitJoinRef(
  stripped: string,
  position: 'key' | 'value',
  visit: (alias: string, col: string, position: 'key' | 'value') => void,
): void {
  const dotIdx = stripped.indexOf('.@');
  if (dotIdx === -1) return;
  visit(stripped.slice(0, dotIdx), stripped.slice(dotIdx + 2), position);
}

/** Human phrase for the plaintext kind a hashed column accepts —
 * mirrors canonicalizePlain's type dispatch for error messages. */
function plaintextPhrase(plainType: string): string {
  const kind = plainType === 'DATE' || plainType === 'TIMESTAMP'
    ? 'Date'
    : plainType === 'BIGINT'
    ? 'bigint'
    : plainType === 'BOOLEAN'
    ? 'boolean'
    : plainType === 'JSON' || plainType === 'JSONB'
    ? 'object'
    : [
        'INTEGER',
        'INT',
        'TINYINT',
        'SMALLINT',
        'DECIMAL',
        'NUMERIC',
        'FLOAT',
        'DOUBLE',
        'REAL',
        'BIT',
      ].includes(plainType)
    ? 'number'
    : 'string';
  return `accepts plaintext ${kind}`;
}

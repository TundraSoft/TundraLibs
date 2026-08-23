/**
 * @module
 *
 * `compileRuntime` — derive everything the runtime needs from a
 * composed registry (`use(...)` output), exactly once.
 *
 * The `Runtime` is the single shared artifact behind a Norm instance:
 * reverse-relation map, encrypted/non-filterable column sets, resolved
 * crypto callbacks, the executor, the shared event emitter, and one
 * `CompiledEntity` per registered entity (cached metadata + the
 * GENERATED insert/update Guardians). Transaction-scoped instances
 * share the parent's Runtime by reference.
 *
 * Everything is keyed by REGISTRY KEY — the same stable entity names
 * FKs reference.
 *
 * @since 1.0.0
 */

import type {
  AnyColumnBuilder,
  AnyDefinition,
  ColumnSpec,
  EmittedForeignKey,
  ReadHooks,
  TableHooks,
} from './definition/mod.ts';
import { type DigestAlgorithm, hashSiblingOf } from './definition/Column.ts';
import {
  buildWriteGuardians,
  isExpressionValue,
  rehydrateDefault,
  type WriteGuardians,
} from './guardians.ts';
import {
  type CryptoOverrides,
  decodePlain,
  DEFAULT_ENCRYPT_ALGORITHM,
  defaultDecrypt,
  defaultEncrypt,
  defaultHash,
  defaultPbkdf2Hash,
  type EncryptAlgorithm,
  type HashAlgorithm,
  SIBLING_HASH_ALGORITHM,
  stampKeyId,
  VALID_ENCRYPT_ALGORITHMS,
  verifyKeyId,
} from './crypto.ts';
import type { Executor } from './executor.ts';
import { assertRegistry } from './asserts/registry.ts';
import { buildCachePlan, type NormCacheConfig, QueryCache } from './cache.ts';
import {
  type DefinitionIssue,
  NormCryptoError,
  NormDefinitionError,
  NormError,
} from './errors/mod.ts';

/** The operation descriptor a {@link Witness} receives. */
export type WitnessInfo = {
  /** Span-style operation name, e.g. `norm.Users.find` or `norm.raw`. */
  name: string;
  /** Structured detail — `norm.entity`, `norm.operation`. */
  attributes?: Record<string, unknown>;
};

/**
 * The suite-wide observability wrap hook: run `fn` on behalf of the caller,
 * observing it without interfering. Norm routes every repo operation (and
 * `raw()`) through the configured witness, so a tracer wired as
 * `witness: (info, fn) => tracer.startActiveSpan(info.name, fn)` makes each
 * operation an ACTIVE span — and the driver `query` events that fire during
 * `fn` then parent to it automatically via ambient. Events alone cannot
 * provide that nesting: a span created in an event handler is never active
 * across the operation's continuation.
 *
 * CONTRACT (the name is the rule): a witness observes and must not
 * interfere — it must invoke `fn` exactly once, return its result
 * unchanged, and re-throw its errors. Norm does not defend against a
 * misbehaving witness; it is composition-root plumbing, trusted like an
 * exporter or a log handler.
 */
export type Witness = <T>(
  info: WitnessInfo,
  fn: () => Promise<T>,
) => Promise<T>;

/**
 * The `Norm` instance's event bus. Metadata-only by design: NEVER row
 * data, plaintext, or secrets — the driver's own events carry the SQL
 * text and params, and those never cross this bus.
 *
 * Handlers attach inline as `_on<event>` in the constructor, or later
 * via `norm.on(...)`.
 */
export type NormEvents = {
  /** A repo/query operation executed. `id` is the SAME ULID returned
   * in the operation's NormResult envelope — correlate logs with it. */
  call: (
    entity: string,
    op: string,
    timeMs: number,
    isSlow: boolean,
    id: string,
  ) => void;
  /** A read was served from the query cache instead of the database —
   * no `call` fires for it (nothing executed). `id` is the SAME ULID in
   * the returned NormResult envelope. Metadata only. */
  cacheHit: (entity: string, op: string, id: string) => void;
  transactionBegin: (txId: string) => void;
  transactionCommit: (txId: string) => void;
  transactionRollback: (txId: string) => void;
  /** A hazardous-but-legal operation ran: an update/delete with the
   * filter OMITTED (full-table write), an unbounded read on an entity
   * that declared `defaultPageSize: 0`, or a grouped report that filled
   * the default page (`grouped-page-cap` — the report is very likely
   * truncated). Wire this to your logger/alerting — it replaces the old
   * console.warn. */
  warning: (
    entity: string,
    op: string,
    code:
      | 'all-rows-update'
      | 'all-rows-delete'
      | 'unbounded-read'
      | 'grouped-page-cap'
      | 'raw-sql'
      | 'cache-skip'
      | 'cache-error',
    message: string,
  ) => void;
  /** An encrypted cell failed to decrypt on read (corruption, tamper, or
   * a key this instance no longer holds) and — under the default
   * `onDecryptFailure: 'null'` policy — was degraded to `null` instead of
   * aborting the whole page. Wire this to alerting: it is a data-integrity
   * / security signal AND the hook a key-rotation sweep watches. Metadata
   * only — never the ciphertext or the value. `reason`: 'decrypt' = failed
   * auth tag / wrong key; 'decode' = decrypted but malformed. */
  decryptError: (
    entity: string,
    column: string,
    pk: unknown,
    reason: 'decrypt' | 'decode',
  ) => void;

  // ── Engine events, forwarded from the underlying driver ───────────
  // These mirror the driver's own event surface so a norm-only app has
  // one complete bus. query/slowQuery are METADATA ONLY — the driver
  // carries the SQL text and params, which never cross this bus.

  /** The engine's connection pool opened. `engineId` is the driver
   * engine's instance id. */
  connect: (engineId: string) => void;
  /** The engine's connection pool closed. */
  disconnect: (engineId: string) => void;
  /** The engine failed to establish its initial connection. */
  connectionFailed: (engineId: string, error: Error) => void;
  /** A non-fatal engine-level error surfaced from the driver. */
  error: (engineId: string, error: Error) => void;
  /** A transaction the engine auto-rolled back on timeout (SQL engines
   * only — Mongo exposes no transaction surface). */
  transactionTimeout: (txId: string) => void;
  /** A single statement executed on the engine — METADATA ONLY. The
   * SQL/command text and its parameters are deliberately NOT included;
   * `queryId` correlates with the driver's own `query` event. */
  query: (
    engineId: string,
    queryId: string,
    timeMs: number,
    isSlow: boolean,
    txId?: string,
  ) => void;
  /** A statement that exceeded the engine's slow-query threshold —
   * metadata only, same shape as {@link NormEvents.query} minus the
   * (always-true) slow flag. */
  slowQuery: (
    engineId: string,
    queryId: string,
    timeMs: number,
    txId?: string,
  ) => void;
};

/** Typed emit bound to the root instance's bus. */
export type NormEmit = <K extends keyof NormEvents>(
  event: K,
  ...args: Parameters<NormEvents[K]>
) => void;

/** Resolved crypto callbacks + parameters. Digest algorithms are NOT
 * here: siblings are pinned SHA-256, digest columns carry their own. */
export type NormCrypto = {
  readonly secret: string | undefined;
  readonly algorithm: EncryptAlgorithm;
  readonly encrypt: (
    plaintext: string,
    secret: string,
    algorithm: EncryptAlgorithm,
  ) => Promise<string>;
  readonly decrypt: (
    ciphertext: string,
    secret: string,
    algorithm: EncryptAlgorithm,
  ) => Promise<string>;
  readonly hash: (
    plaintext: string,
    algorithm: HashAlgorithm,
  ) => Promise<string>;
  /** Salted PBKDF2 password hash for `Column.password('PBKDF2')`. */
  readonly pbkdf2Hash: (plaintext: string) => Promise<string>;
};

/** One inverse relation registered on a target entity. */
export type ReverseRelation = {
  /** What users write as `@<name>` on the target. */
  readonly reverseName: string;
  /** Registry key of the SOURCE entity (the FK holder). */
  readonly sourceKey: string;
  readonly sourceTableName: string;
  readonly sourceDbSchema: string | undefined;
  readonly fkAlias: string;
  /** Target column → source column (target's perspective). */
  readonly on: Record<string, string>;
  readonly cardinality: 'hasOne' | 'hasMany';
  /** FK declared `reverseProject: true` — the TARGET's default reads
   * eagerly include this reverse (hasOne only; compile re-validates). */
  readonly eager?: true;
};

/** `<targetKey>` → `<reverseName>` → relation. */
export type ReverseMap = ReadonlyMap<
  string,
  ReadonlyMap<string, ReverseRelation>
>;

/**
 * Per-entity artifact compiled once: cached metadata + generated
 * Guardians. Every repo operation reads from here.
 */
export type CompiledEntity = {
  readonly def: AnyDefinition;
  /** Registry key — the entity's stable name. */
  readonly key: string;
  readonly columnNames: string[];
  /** Locally non-filterable columns (`filterable:false` or encrypted). */
  readonly nonFilterable: ReadonlySet<string>;
  readonly localEncrypted: ReadonlySet<string>;
  /** Encrypted column → hash-sibling column. */
  readonly hashSiblings: ReadonlyMap<string, string>;
  /** One-way digest columns (`Column.hash(algo)`) → their algorithm.
   * The write path digests the validated plaintext in place. */
  readonly digestColumns: ReadonlyMap<string, DigestAlgorithm>;
  /** VIRTUAL mask columns → source + transform. NEVER sent to SQL
   * (columnNames/projectedColumns exclude them) — computed post-read
   * from the fetched source. */
  readonly masks: ReadonlyMap<
    string,
    { readonly source: string; readonly fn: (v: unknown) => unknown }
  >;
  /** Masks in the DEFAULT projection (mask itself not hidden()). */
  readonly maskedProjected: ReadonlyArray<string>;
  /** FK alias → TARGET REGISTRY KEY. */
  readonly joinTargets: ReadonlyMap<string, string>;
  /**
   * Defaults the REPO applies after validation: DB-side expression
   * markers (any column) and JS defaults on guardian-EXCLUDED columns
   * (scope-disabled but system-filled — e.g. an `updatedAt` outside
   * the update pick-list with `defaultOnUpdate`). Literals are
   * pre-rehydrated; functions called per row.
   */
  readonly postInsertDefaults: ReadonlyMap<string, unknown>;
  readonly postUpdateDefaults: ReadonlyMap<string, unknown>;
  /**
   * Columns a CALLER may write per operation — exactly the generated
   * guardian's shape keys. Expression markers are validated against
   * these (markers bypass the guardian, so the scope/strict rules
   * must be re-imposed on them explicitly).
   */
  readonly insertableColumns: ReadonlySet<string>;
  readonly updatableColumns: ReadonlySet<string>;
  /** Column transforms. */
  readonly beforeWrite: ReadonlyMap<string, (v: unknown) => unknown>;
  readonly afterRead: ReadonlyMap<string, (v: unknown) => unknown>;
  /** Columns in the DEFAULT projection (hidden ones excluded). */
  readonly projectedColumns: string[];
  /** Columns stripped from RETURNING rows; undefined = no-op. */
  readonly returningStrip: ReadonlySet<string> | undefined;
  /** Generated write guardians (TABLE only). */
  readonly guardians: WriteGuardians | undefined;
  /** Row-level hooks from the definition. */
  readonly hooks:
    | TableHooks<Record<string, AnyColumnBuilder>>
    | ReadHooks<Record<string, AnyColumnBuilder>>
    | undefined;
};

/** The once-compiled, shared-by-reference state behind an instance. */
export type Runtime = {
  readonly registry: Record<string, AnyDefinition>;
  readonly reverseMap: ReverseMap;
  /** `<registryKey>.<colName>` → LOGICAL type, for every encrypted
   * column — the read path decodes decrypted canonical strings back
   * to the declared type (Date / bigint / number / boolean / json). */
  readonly encryptedFqn: ReadonlyMap<string, string>;
  /** `<registryKey>.<colName>` for every non-filterable column
   * (explicit `unfilterable()` and ALL encrypted columns — used by the
   * orderBy guard, where even hashed columns stay rejected: ordering
   * by digest is meaningless). */
  readonly nonFilterableFqn: ReadonlySet<string>;
  /** `<registryKey>.<colName>` → digest target for every column whose
   * plaintext filters rewrite to digest equality: `.encrypt().hash()`
   * columns target their SIBLING (pinned SHA-256); `Column.hash(algo)`
   * digest columns target THEMSELVES with their declared algorithm. */
  readonly hashedFqn: ReadonlyMap<string, HashedTarget>;
  readonly crypto: NormCrypto;
  /** Read-path policy when a cell won't decrypt (default `'null'`). */
  readonly onDecryptFailure: DecryptFailurePolicy;
  readonly executor: Executor;
  /** Root instance's emitter — tx-scoped calls surface on it too. */
  readonly emit: NormEmit;
  readonly compiled: ReadonlyMap<string, CompiledEntity>;
  /** Entity key → projection keys its DEFAULT reads eagerly include
   * (`@`-less FK aliases with `project: true` + hasOne reverse names
   * with `reverseProject: true`). Empty map entries are omitted. */
  readonly eager: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Observability wrapper from `NormConfig.witness`; see {@link Witness}. */
  readonly witness?: Witness;
  /** The read-query cache, present only when the `Norm` was constructed
   * with a `cache` config. Undefined = caching globally off. */
  readonly cache?: QueryCache;
};

/** Where a hashed filter's digest lands. */
export type HashedTarget = {
  /** Column that stores the digest (sibling, or the column itself). */
  readonly column: string;
  readonly algorithm: HashAlgorithm;
};

/**
 * What the read path does when an encrypted cell fails to decrypt.
 * `null` (default): degrade that cell to `null` and emit a `decryptError`
 * event, keeping the rest of the page. `throw`: raise a
 * {@link NormCryptoError} and abort the read.
 */
export type DecryptFailurePolicy = 'null' | 'throw';

/**
 * Decrypt + decode ONE encrypted cell, honoring the instance's
 * `onDecryptFailure` policy. The ONE kernel shared by the repo read
 * path ({@link Runtime}-bound {@linkcode Repo}) and `Norm.query()`'s
 * entity-bound decode: on failure it either throws
 * {@link NormCryptoError} (`'throw'`) or emits a metadata-only
 * `decryptError` event and returns `null` (`'null'`, the default), so a
 * single corrupt / tampered / wrong-key cell never aborts a whole read.
 *
 * @param secret - The resolved secret (callers ensure it is present).
 * @param column - Column name for the event / error (relation-qualified
 *   on joined rows).
 * @param pk - Best-effort primary key for the event / error metadata.
 */
export async function decryptCell(
  runtime: Runtime,
  entityKey: string,
  secret: string,
  value: string,
  logicalType: string,
  column: string,
  pk: unknown,
): Promise<unknown> {
  const crypto = runtime.crypto;
  let plain: string;
  try {
    plain = await crypto.decrypt(value, secret, crypto.algorithm);
  } catch (cause) {
    return decryptCellFailure(
      runtime,
      entityKey,
      column,
      pk,
      'decrypt',
      cause as Error,
    );
  }
  try {
    return decodePlain(plain, logicalType);
  } catch (cause) {
    return decryptCellFailure(
      runtime,
      entityKey,
      column,
      pk,
      'decode',
      cause as Error,
    );
  }
}

/** Apply the decrypt-failure policy: throw a typed error, or emit a
 * `decryptError` event and degrade the cell to `null`. */
function decryptCellFailure(
  runtime: Runtime,
  entityKey: string,
  column: string,
  pk: unknown,
  reason: 'decrypt' | 'decode',
  cause: Error,
): null {
  if (runtime.onDecryptFailure === 'throw') {
    throw new NormCryptoError({ entity: entityKey, column, pk, reason }, cause);
  }
  runtime.emit('decryptError', entityKey, column, pk, reason);
  return null;
}

/** Crypto/behavior knobs `compileRuntime` consumes. */
export type CompileConfig = {
  readonly secret?: string | undefined;
  readonly algorithm?: EncryptAlgorithm | undefined;
  readonly crypto?: CryptoOverrides | undefined;
  readonly onDecryptFailure?: DecryptFailurePolicy | undefined;
};

/**
 * Validate runtime config against the registry and derive the shared
 * Runtime.
 *
 * @throws {NormDefinitionError} On missing secret (encrypted columns
 *   present), unknown algorithms, expression defaults on encrypted
 *   columns, or reverse-relation naming collisions.
 */
export function compileRuntime(
  registry: Record<string, AnyDefinition>,
  cfg: CompileConfig,
  executor: Executor,
  emit: NormEmit,
  witness?: Witness,
  cacheCfg?: NormCacheConfig,
): Runtime {
  const algorithm = cfg.algorithm ?? DEFAULT_ENCRYPT_ALGORITHM;

  // Structural rules (per-definition AND cross-entity) live in ONE
  // place — the asserts layer. use() already ran this for composed
  // registries; hand-built ones get identical validation here.
  assertRegistry(registry, { scope: 'compile()', definitions: true });
  validateRuntimeConfig(registry, cfg.secret, algorithm, cfg.crypto);

  const crypto: NormCrypto = {
    secret: cfg.secret,
    algorithm,
    // Every write is stamped with the key's fingerprint and every read
    // verifies it, so a value can name the key that produced it — the
    // hook `rotateKey()` relies on. BYO crypto (`cfg.crypto`) is wrapped
    // too, so custom ciphers are rotation-compatible for free.
    encrypt: stampKeyId(cfg.crypto?.encrypt ?? defaultEncrypt),
    decrypt: verifyKeyId(cfg.crypto?.decrypt ?? defaultDecrypt),
    hash: cfg.crypto?.hash ?? defaultHash,
    pbkdf2Hash: cfg.crypto?.pbkdf2Hash ?? defaultPbkdf2Hash,
  };

  const compiled = new Map<string, CompiledEntity>();
  for (const [key, def] of Object.entries(registry)) {
    compiled.set(key, compileEntity(def, key));
  }

  const encryptedFqn = new Map<string, string>();
  const nonFilterableFqn = new Set<string>();
  const hashedFqn = new Map<string, HashedTarget>();
  for (const [key, def] of Object.entries(registry)) {
    for (const [col, raw] of Object.entries(def.columns)) {
      const spec = raw as ColumnSpec;
      if (spec.encrypt === true) encryptedFqn.set(`${key}.${col}`, spec.type);
      // Digest columns join the ORDER-BY/value-position rejection set:
      // sorting by hex digest is meaningless. WHERE stays unaffected —
      // the rewrite path resolves digests before consulting this set.
      if (
        spec.filterable === false || spec.encrypt === true ||
        spec.hashed !== undefined
      ) {
        nonFilterableFqn.add(`${key}.${col}`);
      }
      if (
        spec.encrypt === true && spec.hash === true &&
        spec.filterable !== false
      ) {
        hashedFqn.set(`${key}.${col}`, {
          column: hashSiblingOf(col),
          algorithm: SIBLING_HASH_ALGORITHM,
        });
      }
      if (spec.hashed !== undefined && spec.filterable !== false) {
        hashedFqn.set(`${key}.${col}`, {
          column: col,
          algorithm: spec.hashed as HashAlgorithm,
        });
      }
    }
  }

  const reverseMap = buildReverseMap(registry);

  // Read cache (opt-in): derive the static plan, then GUARD the
  // encryption boundary — an external cache store must never hold the
  // decrypted plaintext of an `encrypt()` column, so cache + encrypted
  // columns are only allowed together on the in-process MEMORY engine.
  let cache: QueryCache | undefined;
  if (cacheCfg !== undefined) {
    const plan = buildCachePlan(registry);
    const engineName = (cacheCfg.engine ?? 'MEMORY').trim().toUpperCase();
    if (engineName !== 'MEMORY') {
      for (const key of plan.cacheable) {
        if ((compiled.get(key)?.localEncrypted.size ?? 0) > 0) {
          throw new NormError(
            `Entity '${key}' declares encrypted columns and cache > 0 on the ` +
              `'${engineName}' cache engine — caching would store their ` +
              `decrypted plaintext at rest. Cache encrypted entities only on ` +
              `the in-process 'MEMORY' engine, or drop 'cache' on this entity.`,
            { code: 'INVALID_CACHE_CONFIG', entity: key },
          );
        }
      }
    }
    cache = new QueryCache(
      cacheCfg,
      plan,
      (entity, message) =>
        emit('warning', entity, 'CACHE', 'cache-error', message),
    );
  }

  // Default-read eager keys per entity: own belongsTo aliases with
  // `project: true`, plus hasOne reverses whose FK declared
  // `reverseProject: true`.
  const eager = new Map<string, string[]>();
  for (const [key, def] of Object.entries(registry)) {
    const keys: string[] = [];
    if (def.type !== 'QUERY' && def.foreignKeys !== undefined) {
      for (
        const [alias, fk] of Object.entries(
          def.foreignKeys as Record<string, EmittedForeignKey>,
        )
      ) {
        if (fk.project === true) keys.push(alias);
      }
    }
    for (const [name, rel] of reverseMap.get(key) ?? []) {
      if (rel.eager === true) keys.push(name);
    }
    if (keys.length > 0) eager.set(key, keys);
  }

  return {
    registry,
    reverseMap,
    witness,
    encryptedFqn,
    nonFilterableFqn,
    hashedFqn,
    crypto,
    onDecryptFailure: cfg.onDecryptFailure ?? 'null',
    executor,
    emit,
    compiled,
    eager,
    cache,
  };
}

/** Derive one entity's cached metadata + generated Guardians. */
function compileEntity(def: AnyDefinition, key: string): CompiledEntity {
  const columns = def.columns as Record<string, ColumnSpec>;
  // Virtual masks never reach SQL: every DB-facing list excludes them.
  const columnNames = Object.keys(columns).filter(
    (c) => columns[c]!.masked === undefined,
  );
  const masks = new Map<
    string,
    { source: string; fn: (v: unknown) => unknown }
  >();
  const maskedProjected: string[] = [];
  for (const [name, spec] of Object.entries(columns)) {
    if (spec.masked === undefined) continue;
    masks.set(name, {
      source: spec.masked.source,
      fn: spec.masked.fn as (v: unknown) => unknown,
    });
    if (spec.project !== false) maskedProjected.push(name);
  }

  const nonFilterable = new Set<string>();
  const localEncrypted = new Set<string>();
  const hashSiblings = new Map<string, string>();
  const digestColumns = new Map<string, DigestAlgorithm>();
  const postInsertDefaults = new Map<string, unknown>();
  const postUpdateDefaults = new Map<string, unknown>();
  const beforeWrite = new Map<string, (v: unknown) => unknown>();
  const afterRead = new Map<string, (v: unknown) => unknown>();
  const projected: string[] = [];

  for (const [name, spec] of Object.entries(columns)) {
    const isEncrypted = spec.encrypt === true;
    if (spec.filterable === false || isEncrypted || spec.hashed !== undefined) {
      nonFilterable.add(name);
    }
    if (isEncrypted) {
      localEncrypted.add(name);
      if (spec.hash === true) hashSiblings.set(name, hashSiblingOf(name));
    }
    if (spec.hashed !== undefined) {
      digestColumns.set(name, spec.hashed as DigestAlgorithm);
    }
    // Post-validation defaults: expression markers always (the
    // Guardian cannot represent them); JS defaults only when the
    // Guardian EXCLUDES the column (scope-disabled) — included
    // columns get theirs via `.optional(default)` inside the Guardian.
    const ins = spec.default?.insert;
    if (ins !== undefined) {
      if (isExpressionValue(ins)) postInsertDefaults.set(name, ins);
      else if (spec.disableInsert === true) {
        postInsertDefaults.set(name, rehydrateDefault(spec, ins));
      }
    }
    const upd = spec.default?.update;
    if (upd !== undefined) {
      if (isExpressionValue(upd)) postUpdateDefaults.set(name, upd);
      else if (spec.disableUpdate === true) {
        postUpdateDefaults.set(name, rehydrateDefault(spec, upd));
      }
    }
    if (spec.transforms?.beforeWrite !== undefined) {
      beforeWrite.set(name, spec.transforms.beforeWrite as never);
    }
    if (spec.transforms?.afterRead !== undefined) {
      afterRead.set(name, spec.transforms.afterRead as never);
    }
    if (spec.project !== false && spec.masked === undefined) {
      projected.push(name);
    }
  }

  const insertableColumns = new Set<string>();
  const updatableColumns = new Set<string>();
  for (const [name, spec] of Object.entries(columns)) {
    if (spec.disableInsert !== true) insertableColumns.add(name);
    if (spec.disableUpdate !== true) updatableColumns.add(name);
  }

  const joinTargets = new Map<string, string>();
  if (def.type !== 'QUERY' && def.foreignKeys !== undefined) {
    for (
      const [alias, fk] of Object.entries(
        def.foreignKeys as Record<string, EmittedForeignKey>,
      )
    ) {
      joinTargets.set(alias, fk.model);
    }
  }

  return {
    def,
    key,
    columnNames,
    nonFilterable,
    localEncrypted,
    hashSiblings,
    digestColumns,
    masks,
    maskedProjected,
    joinTargets,
    postInsertDefaults,
    postUpdateDefaults,
    insertableColumns,
    updatableColumns,
    beforeWrite,
    afterRead,
    projectedColumns: projected,
    returningStrip: projected.length === columnNames.length
      ? undefined
      : new Set(columnNames.filter((c) => !projected.includes(c))),
    guardians: def.type === 'TABLE' ? buildWriteGuardians(columns) : undefined,
    hooks: (def as { hooks?: CompiledEntity['hooks'] }).hooks,
  };
}

/**
 * Reverse-relation derivation: walk every FK and register an inverse
 * on its target. Naming: `reverseAs` wins; otherwise the SOURCE's
 * registry key; two FKs from the same source to the same target
 * auto-qualify as `<SourceKey>_via_<fkAlias>`. Collisions with target
 * columns or other reverses throw.
 *
 * Cardinality: `hasOne` when the source's local FK columns equal its
 * primary key (each target row matches at most one source row);
 * otherwise `hasMany`.
 */
export function buildReverseMap(
  registry: Record<string, AnyDefinition>,
): ReverseMap {
  type Candidate = Omit<ReverseRelation, 'reverseName'> & {
    explicitName: string | undefined;
  };
  const incoming = new Map<string, Candidate[]>();
  const issues: DefinitionIssue[] = [];

  for (const [sourceKey, source] of Object.entries(registry)) {
    // VIEWs carry LOGICAL fks (join-only) and derive reverses like
    // tables do — that's the M2M-via-view pattern. QUERY is terminal.
    if (source.type === 'QUERY' || source.foreignKeys === undefined) continue;
    const pk = new Set(
      (source as { primaryKeys?: readonly string[] }).primaryKeys ?? [],
    );
    for (
      const [fkAlias, fk] of Object.entries(
        source.foreignKeys as Record<
          string,
          EmittedForeignKey & { reverseAs?: string }
        >,
      )
    ) {
      const targetKey = fk.model;
      if (registry[targetKey] === undefined) continue; // use() validated
      const on: Record<string, string> = {};
      const localCols: string[] = [];
      for (const [localCol, remoteCol] of Object.entries(fk.on)) {
        on[remoteCol] = localCol;
        localCols.push(localCol);
      }
      // Explicit declaration wins; derivation (FK columns = source
      // pk ⇒ at most one source row per target row) is the fallback.
      const cardinality: 'hasOne' | 'hasMany' = fk.reverseCardinality ??
        (localCols.length === pk.size && localCols.every((c) => pk.has(c))
          ? 'hasOne'
          : 'hasMany');
      if (fk.reverseProject === true && cardinality !== 'hasOne') {
        // Entity() validates its own pk-derivation; explicit hasMany
        // or hand-built specs land here.
        issues.push({
          model: sourceKey,
          path: `fk.${fkAlias}.reverseProject`,
          message: `reverseProject needs a hasOne reverse — eager to-many ` +
            `lists on every default read are rejected.`,
        });
      }
      const list = incoming.get(targetKey) ?? [];
      list.push({
        sourceKey,
        sourceTableName: source.name,
        sourceDbSchema: (source as { dbSchema?: string }).dbSchema,
        fkAlias,
        on,
        cardinality,
        ...(fk.reverseProject === true ? { eager: true as const } : {}),
        explicitName: fk.reverseAs,
      });
      incoming.set(targetKey, list);
    }
  }

  const out = new Map<string, Map<string, ReverseRelation>>();
  for (const [targetKey, candidates] of incoming) {
    const target = registry[targetKey]!;
    const targetCols = new Set(Object.keys(target.columns));
    // The target's OWN FK aliases shadow reverse names at every
    // resolution site (FK checked first) — a same-named reverse would
    // be silently unreachable, so it is a collision, not a shadow.
    const targetFkAliases = new Set(
      target.type !== 'QUERY' && target.foreignKeys !== undefined
        ? Object.keys(target.foreignKeys)
        : [],
    );
    const named = new Map<string, ReverseRelation>();

    const claim = (name: string, c: Candidate): boolean => {
      if (targetCols.has(name)) {
        issues.push({
          model: c.sourceKey,
          path: `fk.${c.fkAlias}.reverseAs`,
          message:
            `reverse name '${name}' collides with column '${targetKey}.${name}'`,
        });
        return false;
      }
      if (targetFkAliases.has(name)) {
        issues.push({
          model: c.sourceKey,
          path: `fk.${c.fkAlias}.reverseAs`,
          message: `reverse name '${name}' collides with foreign-key ` +
            `alias '${name}' on '${targetKey}' — FK aliases resolve ` +
            `first, so the reverse would be unreachable. Set reverseAs.`,
        });
        return false;
      }
      if (named.has(name)) {
        issues.push({
          model: c.sourceKey,
          path: `fk.${c.fkAlias}.reverseAs`,
          message: `reverse name '${name}' on '${targetKey}' is already taken`,
        });
        return false;
      }
      const { explicitName: _e, ...rel } = c;
      named.set(name, { reverseName: name, ...rel });
      return true;
    };

    const auto: Candidate[] = [];
    for (const c of candidates) {
      if (c.explicitName !== undefined) claim(c.explicitName, c);
      else auto.push(c);
    }

    const bySource = new Map<string, Candidate[]>();
    for (const c of auto) {
      const list = bySource.get(c.sourceKey) ?? [];
      list.push(c);
      bySource.set(c.sourceKey, list);
    }
    for (const [sourceKey, cs] of bySource) {
      if (cs.length === 1) {
        // Collision of the derived bare name is a LOUD error (claim
        // records the issue) — no silent fallback: the type layer
        // promises the bare name for a single unnamed FK, so the only
        // honest resolutions are reverseAs or a rename.
        claim(sourceKey, cs[0]!);
      } else {
        for (const c of cs) claim(`${sourceKey}_via_${c.fkAlias}`, c);
      }
    }

    out.set(targetKey, named);
  }

  if (issues.length > 0) throw new NormDefinitionError({ issues });
  return out;
}

/**
 * Runtime-config validation: encrypted columns require a secret; the
 * encrypt algorithm must be recognised; expression defaults on
 * encrypted columns would store PLAINTEXT (the DB computes the value
 * after encryption already ran) and are rejected outright. Digest
 * columns are validated per SPEC (their algorithm is definition
 * data): recognised algorithm, never combined with encrypt/hash, and
 * expression defaults are rejected for the same store-plaintext
 * reason.
 */
function validateRuntimeConfig(
  registry: Record<string, AnyDefinition>,
  secret: string | undefined,
  algorithm: EncryptAlgorithm,
  overrides: CryptoOverrides | undefined,
): void {
  const issues: DefinitionIssue[] = [];

  const hasEncrypted = Object.values(registry).some((def) =>
    Object.values(def.columns).some((c) => (c as ColumnSpec).encrypt === true)
  );
  // Partial encrypt/decrypt overrides would write one format and read
  // another — insert() would store the row, then crash decrypting its
  // own RETURNING. Require the pair.
  if (
    hasEncrypted && overrides !== undefined &&
    (overrides.encrypt !== undefined) !== (overrides.decrypt !== undefined)
  ) {
    const missing = overrides.encrypt === undefined ? 'encrypt' : 'decrypt';
    issues.push({
      model: '<norm>',
      path: `crypto.${missing}`,
      message:
        `crypto.${
          missing === 'encrypt' ? 'decrypt' : 'encrypt'
        } is overridden without crypto.${missing} — encrypted rows would ` +
        `be written in one format and read in another. Override both.`,
    });
  }

  for (const [key, def] of Object.entries(registry)) {
    for (const [colName, raw] of Object.entries(def.columns)) {
      const spec = raw as ColumnSpec;
      // Structural rules (digest algorithms/combos, expression
      // defaults, encrypted pk) live in the asserts layer — only the
      // CONFIG coupling stays here.
      if (spec.encrypt !== true) continue;
      if (secret === undefined || secret.length === 0) {
        issues.push({
          model: key,
          path: `columns.${colName}.encrypt`,
          message:
            `declares encrypt but no 'secret' was provided to new Norm({...})`,
        });
      }
    }
  }

  if (!VALID_ENCRYPT_ALGORITHMS.has(algorithm)) {
    issues.push({
      model: '<norm>',
      path: 'algorithm',
      message: `unknown algorithm ${JSON.stringify(algorithm)}`,
    });
  }
  if (issues.length > 0) throw new NormDefinitionError({ issues });
}

/**
 * @module
 *
 * `Norm` — the entry point. Holds the engine + crypto config;
 * `.use(...schemas)` composes the registries (cross-schema FK keys
 * resolve here, with named errors), compiles the shared Runtime, and
 * returns a fully-typed {@link NormDb}:
 *
 * ```ts ignore
 * const norm = new Norm({ database: { dialect: 'postgres', ... },
 *                          secret: Deno.env.get('NORM_SECRET') });
 * const db    = norm.use(Blog, Stats);   // full app
 * const stats = norm.use(Stats);         // scoped instance, same pool
 *
 * const users = db.repo('Users');        // typed Repo
 * await users.insert({ email: 'a@b.c', ... });
 * ```
 *
 * **Engine is private** — callers never get the engine reference
 * back, and `secret` / `engine` / `crypto` stay OUT of the options
 * bag so `getOptions()` can never leak them.
 *
 * **Events are metadata-only** — entity key, op, timing, plus the
 * engine's own lifecycle + query events forwarded from the driver
 * (`query`/`slowQuery` carry the query id and timing, never the SQL
 * text or its params). Never row data, never plaintext, never secrets.
 *
 * @since 1.0.0
 */

// EVERY `@tundralibs/drivers` import in this file is TYPE-ONLY, and must
// stay that way: a value import of an engine class here lands in the
// runtime graph of every norm consumer, which is exactly what stopped
// norm bundling for edge runtimes (the native SQLite adapter's
// `bun:sqlite` / `@db/sqlite` specifiers). Engines are constructed
// through the `engines/` registry instead.
import type {
  EngineQueryResult,
  EngineTransactionOptions,
} from '@tundralibs/drivers/types';
import type { D1EngineOptions } from '@tundralibs/drivers/d1';
import type { MariaEngineOptions } from '@tundralibs/drivers/maria';
import type {
  MongoEngine,
  MongoEngineOptions,
} from '@tundralibs/drivers/mongo';
import type { NeonHttpEngineOptions } from '@tundralibs/drivers/neon';
import type { PostgresEngineOptions } from '@tundralibs/drivers/postgres';
import type { SQLiteEngineOptions } from '@tundralibs/drivers/sqlite';
import type { TursoEngineOptions } from '@tundralibs/drivers/turso';
import { type EventOptionKeys, Options } from '@tundralibs/utils';
import { resolveEngineFactory } from './engines/mod.ts';
import {
  type AnyDefinition,
  type ComposedSchema,
  type SchemaValue,
  use as composeRegistry,
} from './definition/mod.ts';
import {
  compileRuntime,
  decryptCell,
  type DecryptFailurePolicy,
  type NormEvents,
  type Runtime,
  type Witness,
} from './compile.ts';
import {
  type CryptoOverrides,
  type EncryptAlgorithm,
  type HashAlgorithm,
  SIBLING_HASH_ALGORITHM,
} from './crypto.ts';
import {
  type AnySQLEngine,
  bindTx,
  type Executor,
  mongoExecutor,
  type NormDMLQuery,
  type Session,
  sqlExecutor,
} from './executor.ts';
import { QueryAccessor, ReadRepo, Repo, type RepoFor } from './Repo.ts';
import {
  NormCryptoError,
  NormError,
  NormQueryError,
  NormUnsupportedError,
} from './errors/mod.ts';
import {
  mergeScope,
  normalizeScope,
  type NormScope,
  type ScopeInput,
  type ScopeKeysOf,
} from './scope.ts';
import { coerceCount, makeResult, type NormResult, ulid } from './result.ts';

/**
 * Engine construction config, discriminated by dialect.
 *
 * `neon` (Postgres over HTTP), `turso` and `d1` (SQLite over HTTP) are
 * the fetch-only engines — the ones that work on an edge runtime. The
 * dialect's engine module must be registered before construction; the
 * root `@tundralibs/norm` barrel registers all seven, while
 * `@tundralibs/norm/core` registers none (see `engines/registry.ts`).
 */
export type DatabaseConfig =
  | (
    & { dialect: 'postgres' }
    & Omit<PostgresEngineOptions, '_onnotice' | '_onnotification'>
  )
  | ({ dialect: 'maria' } & MariaEngineOptions)
  | ({ dialect: 'sqlite' } & SQLiteEngineOptions)
  | ({ dialect: 'mongo' } & MongoEngineOptions)
  | ({ dialect: 'neon' } & NeonHttpEngineOptions)
  | ({ dialect: 'turso' } & TursoEngineOptions)
  | ({ dialect: 'd1' } & D1EngineOptions);

/** Constructor options. Exactly one of `engine` / `database`. */
export type NormConfig = {
  /** BYO engine (shared with other tooling). */
  engine?: AnySQLEngine | MongoEngine;
  /** Or let Norm construct one from a dialect config. */
  database?: DatabaseConfig;
  /** Encryption secret for `.encrypt()` columns (e.g. from an env var). */
  secret?: string;
  algorithm?: EncryptAlgorithm;
  crypto?: CryptoOverrides;
  /** What the read path does when an encrypted cell won't decrypt.
   * `'null'` (default) degrades the cell to `null` and emits a
   * `decryptError` event; `'throw'` raises a `NormCryptoError`. */
  onDecryptFailure?: DecryptFailurePolicy;
  /**
   * Observability wrap hook ({@link Witness}) — every repo operation and
   * `raw()` runs through it, so a tracer wired at the composition root makes
   * each operation an active span and driver query events nest under it:
   *
   * ```ts ignore
   * new Norm({ engine, witness: (info, fn) =>
   *   tracer.startActiveSpan(info.name, fn) });
   * ```
   *
   * Held out of the options bag (reference-critical, like the crypto
   * callbacks); a witness must observe without interfering — see
   * {@link Witness} for the contract.
   */
  witness?: Witness;
};

/** `_on<event>` handler keys accepted inline in the constructor. */
type NormEventHandlers = {
  [K in keyof NormEvents as `_on${K}`]?: NormEvents[K] | NormEvents[K][];
};

/**
 * The connection- and crypto-owning root. One `Norm` owns one engine
 * (a single connection pool) and one event bus; call {@link Norm.use}
 * to compose schemas into typed {@link NormDb} handles that share them.
 *
 * The secret, engine, and crypto callbacks are held privately and are
 * deliberately kept OUT of the options bag, so `getOptions()` can never
 * leak them.
 *
 * @example
 * ```ts ignore
 * const norm = new Norm({ engine, secret: Deno.env.get('APP_SECRET') });
 * const db = norm.use(Identity, Shortener);
 * await norm.connect();
 * ```
 */
export class Norm extends Options<NormConfig, NormEvents> {
  private readonly __executor: Executor;
  /** See {@link NormConfig.witness}; threaded into every runtime. */
  private readonly __witness?: Witness;
  private readonly __compileCfg: {
    secret: string | undefined;
    algorithm: EncryptAlgorithm | undefined;
    crypto: CryptoOverrides | undefined;
    onDecryptFailure: DecryptFailurePolicy | undefined;
  };

  /**
   * @param cfg - Engine (`engine`) or a `database` dialect config to
   *   build one, the encryption `secret` and optional `algorithm` /
   *   `crypto` overrides, plus inline `_on<event>` handlers. The secret,
   *   engine, and crypto callbacks are not stored in the options bag.
   */
  public constructor(cfg: NormConfig & NormEventHandlers) {
    super();
    // Sensitive / reference-critical values (secret, engine, crypto
    // callbacks) stay OUT of the options bag: getOptions() must never
    // leak them.
    const {
      engine: _engine,
      database: _database,
      crypto: _crypto,
      secret: _secret,
      witness: _witness,
      ...storable
    } = cfg;
    this._setOptions(storable as EventOptionKeys<NormConfig, NormEvents>);
    const resolved = resolveEngine(cfg);
    this.__witness = cfg.witness;
    this.__executor = resolved.executor;
    this.__forwardEngineEvents(resolved.engine);
    this.__compileCfg = {
      secret: cfg.secret,
      algorithm: cfg.algorithm,
      crypto: cfg.crypto,
      onDecryptFailure: cfg.onDecryptFailure,
    };
  }

  /**
   * Re-emit the underlying driver engine's events on this Norm's bus so
   * a norm-only app has one complete event surface. `query`/`slowQuery`
   * are forwarded METADATA ONLY — the driver's result carries the SQL
   * text and its parameters, which never cross norm's bus.
   */
  private __forwardEngineEvents(engine: AnySQLEngine | MongoEngine): void {
    // A real driver engine always exposes `.on`; a bare object passed as
    // the engine (test mocks) emits nothing, so there is nothing to
    // forward — skip rather than crash.
    if (typeof engine?.on !== 'function') return;
    // Present on every SQL and Mongo engine (query/slowQuery via the
    // shared QueryEngineEvents). The overload cast lets us subscribe
    // through the union without per-dialect branching.
    const on = engine.on.bind(engine) as {
      (e: 'connect' | 'disconnect', cb: (id: string) => void): unknown;
      (
        e: 'connectionFailed' | 'error',
        cb: (id: string, err: Error) => void,
      ): unknown;
      (
        e: 'query' | 'slowQuery',
        cb: (id: string, r: EngineQueryResult) => void,
      ): unknown;
    };
    on('connect', (id) => void this._emit('connect', id));
    on('disconnect', (id) => void this._emit('disconnect', id));
    on(
      'connectionFailed',
      (id, err) => void this._emit('connectionFailed', id, err),
    );
    on('error', (id, err) => void this._emit('error', id, err));
    on(
      'query',
      (id, r) =>
        void this._emit('query', id, r.id, r.time, r.isSlow, r.transactionId),
    );
    on(
      'slowQuery',
      (id, r) =>
        void this._emit('slowQuery', id, r.id, r.time, r.transactionId),
    );
    // transactionTimeout is a SQL-only engine event (Mongo has no tx).
    if (!isMongoEngine(engine)) {
      engine.on(
        'transactionTimeout',
        (_id: string, txId: string) =>
          void this._emit('transactionTimeout', txId),
      );
    }
  }

  /**
   * Compose schemas into a typed database handle. Cross-schema FK
   * entity keys resolve here; every instance returned shares this
   * Norm's engine (one pool) and event bus.
   */
  public use<const S extends readonly SchemaValue[]>(
    ...schemas: S
  ): NormDb<ComposedSchema<S>> {
    const registry = composeRegistry(...schemas) as Record<
      string,
      AnyDefinition
    >;
    const runtime = compileRuntime(
      registry,
      this.__compileCfg,
      this.__executor,
      (event, ...args) => void this._emit(event, ...args),
      this.__witness,
    );
    // NOT intersected with Record<string, AnyDefinition> — that would
    // collapse `keyof R` to string and repo() would accept any typo.
    return new NormDb<ComposedSchema<S>>(runtime, this.__executor);
  }

  /** Open the underlying engine's connection pool. Idempotent. */
  public connect(): Promise<void> {
    return this.__executor.connect();
  }

  /** Close the underlying engine's connection pool — shared by every
   * `use()` handle. Idempotent. */
  public disconnect(): Promise<void> {
    return this.__executor.disconnect();
  }
}

/** @internal Module-private brand: only `transaction()` can mint a
 * tx-scoped handle, so `inTransaction`/the executor binding can never
 * disagree. */
const TX_SCOPE: unique symbol = Symbol('norm.txScope');
type TxToken = {
  readonly [TX_SCOPE]: true;
  readonly txId: string;
  /** The live driver session — nesting `transaction()` opens a savepoint
   * on it (the driver owns the savepoint lifecycle). */
  readonly session: Session;
};

/** @internal Migration-subsystem seam: NormDb instance → Runtime.
 * The Migrator needs the compiled registry, crypto and executor
 * WITHOUT widening NormDb's public surface. */
const RUNTIMES = new WeakMap<object, Runtime>();

/** @internal Resolve the Runtime behind a NormDb (migrations only). */
export function runtimeOf(db: object): Runtime {
  const rt = RUNTIMES.get(db);
  if (rt === undefined) {
    throw new NormError(
      'runtimeOf(): not a NormDb handle — pass the value returned by ' +
        'norm.use(...).',
      { code: 'INVALID_HANDLE' },
    );
  }
  return rt;
}

/**
 * A typed database handle over a composed registry. Obtained from
 * {@link Norm.use}; transaction-scoped copies come from
 * {@link NormDb.transaction}.
 */
export class NormDb<R, Scope extends string = never> {
  private readonly __runtime: Runtime;
  private readonly __executor: Executor;
  private readonly __txId: string | undefined;
  /** The live driver session when this handle is inside a transaction —
   * nesting `transaction()` opens a savepoint on it. */
  private readonly __session: Session | undefined;
  private readonly __scope: NormScope | undefined;
  private readonly __baseExecutor: Executor;
  private readonly __repoCache = new Map<string, unknown>();

  /** @internal Constructed by `Norm.use()` (and `transaction()`,
   * which passes the module-private tx token — the constructor
   * derives the tx-bound executor itself, so the txId bookkeeping and
   * the executor binding cannot disagree). */
  public constructor(
    runtime: Runtime,
    executor: Executor,
    tx?: TxToken,
    scope?: NormScope,
  ) {
    this.__runtime = runtime;
    this.__scope = scope;
    this.__baseExecutor = executor;
    if (tx !== undefined && tx[TX_SCOPE] === true) {
      this.__txId = tx.txId;
      this.__session = tx.session;
      this.__executor = bindTx(executor, tx.txId);
    } else {
      this.__txId = undefined;
      this.__session = undefined;
      this.__executor = executor;
    }
    RUNTIMES.set(this, runtime);
  }

  /**
   * Return a SCOPED handle: an always-on EQUALITY filter merged into
   * every read AND write of every repo — the tenant-scoping / default-
   * filter primitive. `db.scope({ '@orgId': 42 })` makes every
   * find/count/update/delete carry `orgId = 42` and every insert
   * auto-fill it. A column an entity does not have is GRACEFULLY
   * skipped for that entity. Chains: `db.scope(a).scope(b)` composes
   * (later wins); the scope survives `transaction()`. Equality
   * primitives only. NOT applied to `raw()` / `query()` (below the
   * filter layer — those bypass scope and warn).
   */
  public scope<const S extends ScopeInput>(
    scope: S,
  ): NormDb<R, Scope | (ScopeKeysOf<S> & string)> {
    const next = mergeScope(
      this.__scope,
      normalizeScope(scope as Record<string, unknown>, 'db.scope()'),
    );
    const db = new NormDb<R, Scope | (ScopeKeysOf<S> & string)>(
      this.__runtime,
      this.__rawExecutor(),
      this.__txId !== undefined && this.__session !== undefined
        ? { [TX_SCOPE]: true, txId: this.__txId, session: this.__session }
        : undefined,
      next,
    );
    return db;
  }

  /** The un-tx-bound executor (the constructor re-binds when txId is
   * present) — so scope() doesn't double-wrap bindTx. */
  private __rawExecutor(): Executor {
    return this.__baseExecutor;
  }

  /** The composed registry (plain definitions). */
  public get entities(): R {
    return this.__runtime.registry as unknown as R;
  }

  /** Whether this handle is bound to a transaction. */
  public get inTransaction(): boolean {
    return this.__txId !== undefined;
  }

  /**
   * The typed accessor for a registered entity: {@link Repo} for
   * TABLEs, {@link ReadRepo} for VIEWs, {@link QueryAccessor} for
   * QUERYs.
   */
  public repo<K extends keyof R & string>(key: K): RepoFor<R, K, Scope> {
    const cached = this.__repoCache.get(key);
    if (cached !== undefined) return cached as RepoFor<R, K, Scope>;
    const compiled = this.__runtime.compiled.get(key);
    if (compiled === undefined) {
      throw new NormQueryError(`Unknown entity '${key}'`, {
        entity: key,
        code: 'UNKNOWN_ENTITY',
      });
    }
    let accessor: unknown;
    switch (compiled.def.type) {
      case 'TABLE':
        accessor = new Repo<Record<string, AnyDefinition>, string>(
          this.__runtime,
          compiled,
          this.__executor,
          this.__txId,
          this.__scope,
        );
        break;
      case 'VIEW':
        accessor = new ReadRepo<Record<string, AnyDefinition>, string>(
          this.__runtime,
          compiled,
          this.__executor,
          this.__txId,
          this.__scope,
        );
        break;
      case 'QUERY':
        accessor = new QueryAccessor(
          this.__runtime,
          compiled,
          this.__executor,
          this.__txId,
        );
        break;
    }
    // Observability boundary: with a witness configured, the accessor's
    // operation methods are wrapped ONCE here (and cached wrapped), so every
    // call site gets witnessed without Repo/ReadRepo/QueryAccessor knowing.
    const witness = this.__runtime.witness;
    if (witness !== undefined) {
      accessor = witnessAccessor(accessor as object, key, witness);
    }
    this.__repoCache.set(key, accessor);
    return accessor as RepoFor<R, K, Scope>;
  }

  /**
   * Custom-query escape hatch: run an arbitrary DML query through the
   * engine's dialect translator. Result rows come back RAW —
   * ciphertext is not decrypted (use {@link decrypt} by hand).
   */
  public async query<
    Res extends Record<string, unknown> = Record<string, unknown>,
  >(
    q: NormDMLQuery,
    opts: { entity?: keyof R & string } = {},
  ): Promise<NormResult<Res[]>> {
    const id = ulid();
    const res = await this.__executor.execute<Res>(q);
    // Optional ENTITY BINDING: hand-built IR stays raw by default,
    // but naming the entity the rows came from lets them ride the
    // read pipeline's decrypt + decode + afterRead column transforms.
    // NOT applied: hashed-filter rewrites (the IR already ran), masks
    // (their sources may be absent), and the afterRead ROW hook (rows
    // may be partial/aggregated shapes).
    if (opts.entity !== undefined) {
      const compiled = this.__runtime.compiled.get(opts.entity);
      if (compiled === undefined) {
        throw new NormQueryError(
          `query(): unknown entity '${opts.entity}' — bind to a ` +
            `registered entity key.`,
          { entity: opts.entity, code: 'UNKNOWN_ENTITY' },
        );
      }
      // No secret ⇒ nothing to decrypt; leave ciphertext raw.
      const secret = this.__runtime.crypto.secret;
      for (const row of res.data as Record<string, unknown>[]) {
        if (secret !== undefined) {
          for (const col of compiled.localEncrypted) {
            const v = row[col];
            if (typeof v !== 'string') continue;
            const logical = this.__runtime.encryptedFqn.get(
              `${compiled.key}.${col}`,
            ) ?? 'TEXT';
            // Shared decrypt-cell kernel — honors the instance's
            // onDecryptFailure policy (throw, or null + decryptError
            // event) instead of the old bare `catch {}` swallow.
            row[col] = await decryptCell(
              this.__runtime,
              compiled.key,
              secret,
              v,
              logical,
              col,
              undefined,
            );
          }
        }
        for (const [col, fn] of compiled.afterRead) {
          const v = row[col];
          if (v === null || v === undefined) continue;
          row[col] = fn(v);
        }
      }
    }
    this.__runtime.emit(
      'call',
      (q as { table?: string }).table ?? '<query>',
      q.type,
      res.time,
      res.isSlow,
      id,
    );
    return makeResult<Res[]>({
      id,
      op: q.type,
      txId: this.__txId,
      count: coerceCount(res.count),
      time: res.time,
      isSlow: res.isSlow,
      data: res.data,
    });
  }

  /**
   * Escape hatch: run a HAND-WRITTEN SQL string with named `:param:`
   * placeholders. Bound to the connection/transaction, NOT to an
   * entity — rows come back exactly as the driver returns them: no
   * decryption, no afterRead, no hashed-filter rewrite. SQL engines
   * only (Mongo throws `NormUnsupportedError`).
   *
   * ALWAYS pass values through `params` — never interpolate into the
   * string. Parameterized values are the injection-safe path; a
   * concatenated string is not.
   *
   * ```ts ignore
   * const r = await db.raw<{ n: number }>(
   *   'SELECT count(*) AS n FROM users WHERE status = :s:',
   *   { s: 'active' },
   * );
   * r.data[0].n; // number
   * ```
   */
  public async raw<
    Res extends Record<string, unknown> = Record<string, unknown>,
  >(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<NormResult<Res[]>> {
    const id = ulid();
    // Raw SQL bypasses every typed guarantee (decrypt, hashed-filter
    // rewrite, validation, scoping) — surface it as a warning event so
    // audits can see when the escape hatch is used.
    this.__runtime.emit(
      'warning',
      '<raw>',
      'RAW',
      'raw-sql',
      'db.raw() executed hand-written SQL — no decrypt / validation / ' +
        'scope applied.',
    );
    const witness = this.__runtime.witness;
    const run = () => this.__executor.raw<Res>(sql, params, this.__txId);
    const res = witness === undefined ? await run() : await witness(
      { name: 'norm.raw', attributes: { 'norm.operation': 'RAW' } },
      run,
    );
    this.__runtime.emit('call', '<raw>', 'RAW', res.time, res.isSlow, id);
    return makeResult<Res[]>({
      id,
      op: 'RAW',
      txId: this.__txId,
      count: coerceCount(res.count),
      time: res.time,
      isSlow: res.isSlow,
      data: res.data,
    });
  }

  /**
   * Run `fn` inside a database transaction. The driver owns the
   * lifecycle: it reserves a connection, COMMITs when `fn` resolves,
   * ROLLBACKs when it throws, and always releases the connection
   * (leak-safe). The `tx` handle shares this Runtime by reference
   * (nothing re-derived).
   *
   * Nesting: calling `transaction()` on a handle already inside a
   * transaction runs `fn` under a `SAVEPOINT` on the same engine
   * transaction (the driver owns the savepoint too). Resolve folds the
   * inner work into the outer tx; a throw rolls back ONLY the inner work
   * (the outer tx stays alive) and rethrows — catch it to continue the
   * outer transaction. `options` apply to the outermost transaction only
   * (a savepoint cannot change isolation mid-flight) and are ignored on
   * the nested path.
   *
   * Events: `transactionBegin` / `Commit` / `Rollback` fire for a REAL
   * engine transaction only — savepoints emit none. `Rollback` means the
   * callback threw and the tx was rolled back; a COMMIT-time failure
   * surfaces as an error but is NOT a rollback event (the data may even
   * be on the wire).
   */
  public async transaction<T>(
    fn: (tx: NormDb<R, Scope>) => Promise<T>,
    options?: EngineTransactionOptions,
  ): Promise<T> {
    if (!this.__executor.capabilities.transactions) {
      throw new NormUnsupportedError({ feature: 'transactions' });
    }
    // Nested → SAVEPOINT on the active engine transaction. The driver
    // owns create / rollback-to / release (and scopes its
    // auto-rollback-on-failure to the savepoint, so a SQL failure inside
    // `fn` undoes only to here). No transaction events for savepoints.
    if (this.__session !== undefined) {
      return await this.__session.savepoint((sp) =>
        fn(
          new NormDb<R, Scope>(this.__runtime, this.__rawExecutor(), {
            [TX_SCOPE]: true,
            txId: sp.id,
            session: sp,
          }, this.__scope),
        )
      );
    }
    // Outer → a REAL engine transaction, driven by the driver's callback.
    let txId: string | undefined;
    let fnThrew = false;
    try {
      const result = await this.__executor.transaction(async (session) => {
        txId = session.id;
        this.__runtime.emit('transactionBegin', session.id);
        const scoped = new NormDb<R, Scope>(
          this.__runtime,
          this.__rawExecutor(),
          { [TX_SCOPE]: true, txId: session.id, session },
          this.__scope,
        );
        try {
          return await fn(scoped);
        } catch (err) {
          // Distinguish a callback failure (→ rollback event) from a
          // commit/finalization failure (→ no rollback event): only the
          // former sets this flag. Catches a synchronous throw from `fn`
          // too, not just a rejected promise.
          fnThrew = true;
          throw err;
        }
      }, options);
      this.__runtime.emit('transactionCommit', txId!);
      return result;
    } catch (err) {
      if (fnThrew && txId !== undefined) {
        this.__runtime.emit('transactionRollback', txId);
      }
      throw err;
    }
  }

  // ─── Crypto helpers (cooperate with `query()`) ─────────────────────

  /** Encrypt a plaintext with this instance's secret + algorithm. */
  public async encrypt(plaintext: string): Promise<string> {
    return await this.__runtime.crypto.encrypt(
      plaintext,
      this.__requireSecret('encrypt'),
      this.__runtime.crypto.algorithm,
    );
  }

  /** Decrypt a ciphertext produced by the write path / {@link encrypt}. */
  public async decrypt(ciphertext: string): Promise<string> {
    return await this.__runtime.crypto.decrypt(
      ciphertext,
      this.__requireSecret('decrypt'),
      this.__runtime.crypto.algorithm,
    );
  }

  /** Hash a plaintext (no secret). Defaults to SHA-256 — the pinned
   * sibling algorithm — so `db.hash(v)` matches sibling digests; pass
   * the algorithm to match a `Column.hash(algo)` column instead. */
  public async hash(
    plaintext: string,
    algorithm: HashAlgorithm = SIBLING_HASH_ALGORITHM,
  ): Promise<string> {
    return await this.__runtime.crypto.hash(plaintext, algorithm);
  }

  private __requireSecret(op: 'encrypt' | 'decrypt'): string {
    const secret = this.__runtime.crypto.secret;
    if (secret === undefined) {
      throw new NormCryptoError({
        reason: 'missing-secret',
        operation: op,
        code: 'MISSING_SECRET',
      });
    }
    return secret;
  }

  // ─── Engine lifecycle proxies (engine-wide, shared by handles) ─────

  /** Open the underlying engine's connection pool. Engine-wide — every
   * handle from this Norm shares it, so one `connect()` suffices. */
  public connect(): Promise<void> {
    return this.__executor.connect();
  }

  /** Close the underlying engine's connection pool. Affects every
   * handle derived from this Norm. */
  public disconnect(): Promise<void> {
    return this.__executor.disconnect();
  }
}

/** Instance-name counter for engines Norm constructs itself.
 *
 * @internal
 */
let normEngineCounter = 0;
/** The executor plus the concrete engine behind it, so the Norm
 * constructor can forward the engine's events onto its own bus. */
type ResolvedEngine = {
  executor: Executor;
  engine: AnySQLEngine | MongoEngine;
};

/**
 * Is this the Mongo engine? Checked on the engine's own `Engine` label
 * rather than `instanceof MongoEngine`, because the class reference would
 * be a VALUE import of `@tundralibs/drivers/mongo` — dragging the Mongo
 * driver into every consumer's bundle for a branch that only needs to
 * know "SQL or not". Every driver engine sets `Engine`; a bare object
 * used as a test double has none and is treated as SQL, exactly as the
 * `instanceof` check treated it.
 */
function isMongoEngine(
  engine: AnySQLEngine | MongoEngine,
): engine is MongoEngine {
  return (engine as { Engine?: string })?.Engine === 'MONGO';
}

function wrap(engine: AnySQLEngine | MongoEngine): ResolvedEngine {
  return isMongoEngine(engine)
    ? { executor: mongoExecutor(engine), engine }
    : { executor: sqlExecutor(engine), engine };
}

/**
 * Pick the executor: caller-supplied `engine`, or one built from
 * `database` by the dialect's registered factory.
 *
 * @throws {NormError} `INVALID_ENGINE_CONFIG` when both `engine` and
 *   `database` are given, when neither is, or when `database.dialect` is
 *   not a known dialect.
 * @throws {NormError} `ENGINE_NOT_REGISTERED` when the dialect is known
 *   but its `@tundralibs/norm/engines/<dialect>` module has not been
 *   imported.
 */
function resolveEngine(cfg: NormConfig): ResolvedEngine {
  if (cfg.engine !== undefined && cfg.database !== undefined) {
    throw new NormError(
      `new Norm({...}): pass exactly one of 'engine' or 'database', not both.`,
      { code: 'INVALID_ENGINE_CONFIG' },
    );
  }
  if (cfg.engine !== undefined) {
    return wrap(cfg.engine);
  }
  if (cfg.database === undefined) {
    throw new NormError(
      `new Norm({...}): pass one of 'engine' or 'database'.`,
      {
        code: 'INVALID_ENGINE_CONFIG',
      },
    );
  }
  const name = `norm-${++normEngineCounter}`;
  const { dialect, ...rest } = cfg.database;
  // Registry lookup, not a `switch` over imported engine classes — see
  // `engines/registry.ts` for why the classes cannot live in this file.
  const factory = resolveEngineFactory(dialect);
  return wrap(factory(name, rest as Record<string, unknown>));
}

// ---------------------------------------------------------------------
// Witness wiring (see NormConfig.witness / Witness in compile.ts)
// ---------------------------------------------------------------------

/**
 * The accessor methods that count as operations. Everything else —
 * getters, internal helpers — passes through the proxy untouched.
 * Covers Repo (all nine), ReadRepo (find/findOne/count) and
 * QueryAccessor (find); a name missing from a given accessor kind is
 * simply never hit.
 */
const WITNESSED_OPS = new Set([
  'find',
  'findOne',
  'count',
  'getByPK',
  'insert',
  'upsert',
  'update',
  'delete',
  'truncate',
]);

/**
 * Wrap an accessor so its operation methods run through `witness`.
 *
 * A Proxy at the accessor boundary instead of edits inside nine method
 * bodies: one implementation point covers Repo, ReadRepo and
 * QueryAccessor alike, and internal calls (an operation invoking a
 * sibling on `this`) run against the RAW target — so an operation is
 * witnessed exactly once, at the boundary the application called.
 *
 * `Reflect.get(target, prop, target)` and `apply(target, …)` keep
 * `this` bound to the raw accessor, so field access inside methods is
 * unaffected by the proxy. Wrapped methods are cached per accessor for
 * stable function identity across property reads.
 *
 * @param accessor - The raw Repo / ReadRepo / QueryAccessor.
 * @param entity - Registry key, used in the span-style name.
 * @param witness - See {@link Witness}.
 * @returns The proxied accessor, cached by `repo()` in place of the raw one.
 */
function witnessAccessor<T extends object>(
  accessor: T,
  entity: string,
  witness: Witness,
): T {
  const wrapped = new Map<PropertyKey, unknown>();
  return new Proxy(accessor, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function' || !WITNESSED_OPS.has(prop as string)) {
        return value;
      }
      let fn = wrapped.get(prop);
      if (fn === undefined) {
        const op = String(prop);
        fn = (...args: unknown[]) =>
          witness(
            {
              name: `norm.${entity}.${op}`,
              attributes: { 'norm.entity': entity, 'norm.operation': op },
            },
            () =>
              (value as (...a: unknown[]) => Promise<unknown>).apply(
                target,
                args,
              ),
          );
        wrapped.set(prop, fn);
      }
      return fn;
    },
  }) as T;
}

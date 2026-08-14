/**
 * @fileoverview MongoDB driver engine wrapping `npm:mongodb`.
 *
 * MongoDB's wire protocol (BSON, OP_MSG, replica-set discovery, SDAM) is too
 * complex to reimplement from scratch. We wrap the official driver, which
 * already manages its own connection pool internally.
 *
 * Because of that, this driver has no driver-side socket pool: it extends the
 * pool-free `ConnectionEngine` root (not the pooled `BaseEngine`) and holds
 * exactly one `MongoClient`. Operations use the client directly, and Mongo's
 * internal pool handles concurrency.
 *
 * Public API exposes typed helpers for the common CRUD operations plus the
 * `client`, `db`, and `collection` getters for full driver access.
 *
 * **TLS:** the engine-level `ssl` / `ssl.enforce` fields are **ignored**.
 * Mongo's `npm:mongodb` driver configures TLS via the connection URI —
 * use `host: 'mongodb+srv://…/?tls=true'` or the per-host URI flags
 * (`tlsCAFile`, `tlsCertificateKeyFile`, `tlsAllowInvalidCertificates`,
 * etc.). The engine wraps the resulting URI as-is.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { MongoEngine } from '@tundralibs/drivers/mongo';
 *
 * const m = new MongoEngine('app', {
 *   host: '10.1.10.3',
 *   port: 27017,
 *   username: 'mongo',
 *   password: 'mongo',
 *   database: 'myapp',
 * });
 *
 * await m.insertOne('users', { _id: 1, name: 'Alice' });
 * const user = await m.findOne('users', { _id: 1 });
 * await m.disconnect();
 * ```
 */

/// <reference types="npm:@types/node@22" />
// mongodb is pinned to 6.x (see deno.json / package.json `$mongo`): mongodb 7
// crashes on Bun — `node:v8` isBuildingSnapshot is unimplemented — and the
// package.json version is shared with Bun, so every runtime stays on 6.
// Dependabot ignores mongodb >= 7 until Bun implements the API.
import {
  type Collection,
  type Db,
  type Document,
  type Filter,
  MongoClient,
} from '$mongo';
import type { EventOptionKeys } from '@tundralibs/utils';
import { type MongoAction, MongoTranslator } from '@tundralibs/oql/translator';
import type { Query } from '@tundralibs/oql/types';
import { ConnectionEngine } from '../../ConnectionEngine.ts';
import { EngineError } from '../../errors/mod.ts';
import type {
  EngineCapabilities,
  EngineQueryResult,
  MongoEngineEvents,
} from '../../types/mod.ts';
import type { MongoEngineOptions } from './types/mod.ts';

const MONGO_DEFAULTS: Partial<MongoEngineOptions> = {
  port: 27017,
  slowQueryThreshold: 0.5,
};

/**
 * Accepts a bare hostname / FQDN, an IPv4 literal, or a bracketed IPv6
 * literal — nothing that could break out of the host position of the
 * `mongodb://` authority (no `@`, `/`, `?`, `#`, or whitespace). Used to
 * guard `__buildUri` against URI option/host injection.
 */
const HOST_PATTERN =
  /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/;

/**
 * MongoDB engine. Wraps `npm:mongodb`'s `MongoClient`.
 *
 * It extends the pool-free `ConnectionEngine` root and overrides `connect` /
 * `disconnect` / `ping` to drive the `MongoClient` directly — no driver-side
 * pool is used, because Mongo's `MongoClient` already manages its own
 * internally.
 *
 * **Query-stats asymmetry (intentional):** every SQL engine accumulates
 * aggregate query statistics (exposed via `.queryStats` / `.stats.query`).
 * MongoEngine deliberately does NOT — it emits the `query` / `slowQuery`
 * observability events like the SQL engines but keeps no running counters,
 * so it does not override {@link ConnectionEngine._recordQueryStats} and
 * exposes no `queryStats` accessor. Wire counters through an event listener
 * if you need them.
 */
export class MongoEngine
  extends ConnectionEngine<MongoClient, MongoEngineOptions, MongoEngineEvents> {
  /** Always `'MONGO'`. */
  public readonly Engine = 'MONGO';
  /**
   * All `false`: the driver runs its own connection pool, and neither
   * transactions nor prepared statements are wired through to the OQL surface.
   */
  public readonly Capabilities: EngineCapabilities = {
    // Mongo has its own internal pool — we don't expose ours.
    pooledConnections: false,
    // Sessions / `withTransaction()` exist on the driver but aren't
    // wired through to the OQL surface yet (see the "Mongo
    // transaction surface" gap entry in the package's open-items
    // doc). Declare false until that path lands.
    transactions: false,
    // Document operations don't carry SQL-style placeholders.
    preparedStatements: false,
  };

  /** The single shared MongoClient. */
  private __client: MongoClient | null = null;

  /**
   * The in-flight `connect()` attempt, cached so concurrent callers join it
   * instead of racing. Without this, a second caller during `CONNECTING`
   * (when `__client` is still null) short-circuits on the status check and
   * then throws `NO_CONNECTION` — an intermittent startup failure on a
   * healthy server. Cleared once the attempt settles.
   */
  private __connecting: Promise<void> | null = null;

  /** OQL translator. Mongo's sibling to the SQL `AbstractTranslator`. */
  private readonly __translator = new MongoTranslator();

  /** Slow-query threshold in ms, resolved from `slowQueryThreshold`
   * (seconds). A query slower than this fires `slowQuery`. */
  private readonly __slowThresholdMs: number;

  /**
   * Validates options; no client is created until {@link MongoEngine.connect}.
   * Supply either a full `uri` or a `host` — the remaining pieces are assembled
   * into a connection string.
   *
   * @throws {@link EngineError} `MISSING_CONFIG_VALUE` if neither `uri` nor
   *   `host` is set.
   */
  constructor(
    name: string,
    options: EventOptionKeys<MongoEngineOptions, MongoEngineEvents>,
  ) {
    super(name, options, MONGO_DEFAULTS);
    this.__slowThresholdMs = (this._getOption('slowQueryThreshold') ?? 0.5) *
      1000;
    if (
      this.hasOption('uri') === false &&
      this.hasOption('host') === false
    ) {
      throw new EngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'host or uri',
      });
    }
  }

  //#region Lifecycle (overrides ConnectionEngine — no pool)

  /**
   * Open the shared `MongoClient`.
   *
   * Idempotent and concurrency-safe: while a connect is in flight, other
   * callers (including the first operations fanned out at startup) join the
   * same attempt instead of racing it — so none of them observe a still-null
   * client and throw a spurious `NO_CONNECTION`. On failure the status resets
   * to `CLOSED` and the error is rethrown to every joined caller.
   *
   * @emits connect - On successful connection.
   * @emits connectionFailed - On connection failure.
   */
  public override async connect(): Promise<void> {
    if (this._status === 'READY') return;
    // A connect is already in flight — join it rather than returning early
    // (which would leave `__client` null for a concurrent first operation).
    if (this.__connecting !== null) {
      await this.__connecting;
      return;
    }
    this._status = 'CONNECTING';
    const attempt = (async () => {
      try {
        this.__client = await this._connectClient();
        this._status = 'READY';
        this._emit('connect', this.instanceId);
      } catch (e) {
        this._status = 'CLOSED';
        const error = this.__wrapMongoError(e, 'connect');
        this._emit('connectionFailed', this.instanceId, error);
        throw error;
      }
    })();
    // Assigned synchronously (before the first `await` yields) so a concurrent
    // caller sees the in-flight promise and joins it.
    this.__connecting = attempt;
    try {
      await attempt;
    } finally {
      this.__connecting = null;
    }
  }

  /**
   * Open the underlying `MongoClient`. Isolated as an overridable seam so
   * the connect-race behaviour can be unit-tested without a live server.
   */
  protected _connectClient(): Promise<MongoClient> {
    return MongoClient.connect(this.__buildUri(), {
      ...(this._getOption('driverOptions') ?? {}),
    });
  }

  /**
   * Close the shared `MongoClient`.
   *
   * Waits out an in-flight {@link MongoEngine.connect} first, so a client
   * created by that attempt is closed rather than orphaned. Idempotent once
   * `CLOSED`.
   *
   * @throws {@link EngineError} If closing the client fails.
   *
   * @emits disconnect - On successful close.
   * @emits error - When closing the client throws.
   */
  public override async disconnect(): Promise<void> {
    // A connect is still in flight (status CONNECTING, `__client` still
    // null): join it before inspecting `__client`. Otherwise the attempt
    // resumes *after* we've set CLOSED and unconditionally installs a live
    // client + flips status back to READY — orphaning a MongoClient (socket
    // pool + sessions) we never close, with a later `connect()` early-
    // returning on the stuck-READY status. Joining lands us in one of two
    // clean states: the attempt succeeded (`__client` set, status READY → the
    // close path below runs) or it failed (already reset to CLOSED).
    if (this.__connecting !== null) {
      try {
        await this.__connecting;
      } catch {
        /* connect failed → status already CLOSED, `__client` still null */
      }
    }
    if (this._status === 'CLOSED') return;
    try {
      if (this.__client) {
        await this.__client.close();
        this.__client = null;
      }
      this._status = 'CLOSED';
      this._emit('disconnect', this.instanceId);
    } catch (e) {
      const error = this.__wrapMongoError(e, 'disconnect');
      this._emit('error', this.instanceId, error);
      throw error;
    }
  }

  /**
   * Round-trips the `admin` database's `ping` command. Returns `false` rather
   * than throwing when disconnected or when the command fails.
   */
  public override async ping(): Promise<boolean> {
    if (this._status === 'CLOSED' || !this.__client) return false;
    try {
      await this.__client.db('admin').command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  //#endregion Lifecycle

  //#region Public API

  /** The underlying `MongoClient`. Auto-connects if not yet connected. */
  public async client(): Promise<MongoClient> {
    await this.connect();
    return this.__client!;
  }

  /** Get the default database (named via the `database` option). */
  public async db(name?: string): Promise<Db> {
    await this.connect();
    return this.__client!.db(name ?? this.__defaultDb());
  }

  /** Get a collection by name (uses the default database). */
  public async collection<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    name: string,
    dbName?: string,
  ): Promise<Collection<T>> {
    const d = await this.db(dbName);
    // deno-lint-ignore no-explicit-any
    return d.collection<any>(name) as Collection<T>;
  }

  /** Insert a single document. Returns the inserted id. */
  public async insertOne<T extends Record<string, unknown>>(
    collection: string,
    document: T,
  ): Promise<unknown> {
    return await this.__run<unknown, T>(
      'insertOne',
      collection,
      async (col) => {
        const result = await col.insertOne(
          document as Parameters<typeof col.insertOne>[0],
        );
        return result.insertedId;
      },
    );
  }

  /** Insert many documents. Returns the inserted ids. */
  public async insertMany<T extends Record<string, unknown>>(
    collection: string,
    documents: T[],
  ): Promise<unknown[]> {
    return await this.__run<unknown[], T>(
      'insertMany',
      collection,
      async (col) => {
        const result = await col.insertMany(
          documents as unknown as Parameters<typeof col.insertMany>[0],
        );
        return Object.values(result.insertedIds);
      },
    );
  }

  /** Find one document by filter. Returns `null` if no match. */
  public async findOne<T extends Record<string, unknown> = Document>(
    collection: string,
    filter: Record<string, unknown> = {},
  ): Promise<T | null> {
    return await this.__run<T | null, T>(
      'findOne',
      collection,
      async (col) => {
        return (await col.findOne(filter as Filter<T>)) as T | null;
      },
    );
  }

  /**
   * Find documents matching `filter`.
   *
   * @param opts - `limit` / `skip` / `sort` / `projection` to forward to the cursor.
   */
  public async find<T extends Record<string, unknown> = Document>(
    collection: string,
    filter: Record<string, unknown> = {},
    opts: {
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
      projection?: Record<string, 0 | 1>;
    } = {},
  ): Promise<T[]> {
    return await this.__run<T[], T>('find', collection, async (col) => {
      let cursor = col.find(filter as Filter<T>);
      if (opts.projection) cursor = cursor.project(opts.projection);
      if (opts.sort) cursor = cursor.sort(opts.sort);
      if (opts.skip !== undefined) cursor = cursor.skip(opts.skip);
      if (opts.limit !== undefined) cursor = cursor.limit(opts.limit);
      return (await cursor.toArray()) as T[];
    });
  }

  /**
   * Update at most one document. Returns the count of matched (found)
   * documents — `matchedCount + upsertedCount`, NOT `modifiedCount`. This
   * mirrors SQL affected-rows semantics: a filter that matches a row whose
   * `$set` values already equal the stored values reports 1 (Postgres
   * `rowCount` / SQLite `sqlite3_changes()` / Maria CLIENT_FOUND_ROWS), where
   * Mongo's `modifiedCount` would report 0.
   */
  public async updateOne(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    opts: { upsert?: boolean } = {},
  ): Promise<number> {
    return await this.__run('updateOne', collection, async (col) => {
      const r = await col.updateOne(
        filter as Filter<Document>,
        update as Parameters<typeof col.updateOne>[1],
        opts,
      );
      return r.matchedCount + (r.upsertedCount ?? 0);
    });
  }

  /**
   * Update all matching documents. Returns the count of matched (found)
   * documents (`matchedCount`), NOT `modifiedCount` — see {@link updateOne}
   * for why matched-rows is the SQL-consistent choice.
   */
  public async updateMany(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<number> {
    return await this.__run('updateMany', collection, async (col) => {
      const r = await col.updateMany(
        filter as Filter<Document>,
        update as Parameters<typeof col.updateMany>[1],
      );
      return r.matchedCount;
    });
  }

  /**
   * Run a batch of `updateOne` upserts in one round-trip. Used by the
   * OQL bulk UPSERT path. Returns the total count of matched-or-inserted
   * documents across every op (`matchedCount + upsertedCount`) — matched,
   * not modified, to stay consistent with SQL affected-rows (see
   * {@link updateOne}).
   */
  public async bulkUpsert(
    collection: string,
    ops: ReadonlyArray<{
      filter: Record<string, unknown>;
      update: Record<string, unknown>;
    }>,
  ): Promise<number> {
    if (ops.length === 0) return 0;
    return await this.__run('bulkUpsert', collection, async (col) => {
      const requests = ops.map((op) => ({
        updateOne: {
          filter: op.filter as Filter<Document>,
          update: op.update as Parameters<typeof col.updateOne>[1],
          upsert: true,
        },
      }));
      const r = await col.bulkWrite(requests);
      return (r.matchedCount ?? 0) + (r.upsertedCount ?? 0);
    });
  }

  /** Delete at most one matching document. Returns the count actually deleted. */
  public async deleteOne(
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<number> {
    return await this.__run('deleteOne', collection, async (col) => {
      return (await col.deleteOne(filter as Filter<Document>)).deletedCount ??
        0;
    });
  }

  /** Delete all matching documents. Returns the count actually deleted. */
  public async deleteMany(
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<number> {
    return await this.__run('deleteMany', collection, async (col) => {
      return (await col.deleteMany(filter as Filter<Document>)).deletedCount ??
        0;
    });
  }

  /** Count documents matching `filter`. */
  public async countDocuments(
    collection: string,
    filter: Record<string, unknown> = {},
  ): Promise<number> {
    return await this.__run('countDocuments', collection, async (col) => {
      return await col.countDocuments(filter as Filter<Document>);
    });
  }

  /** Run an aggregation pipeline. */
  public async aggregate<T = Record<string, unknown>>(
    collection: string,
    pipeline: Record<string, unknown>[],
  ): Promise<T[]> {
    return await this.__run('aggregate', collection, async (col) => {
      return (await col.aggregate(pipeline).toArray()) as T[];
    });
  }

  //#endregion Public API

  //#region OQL surface — translate then execute

  /**
   * Run a `SELECT` Query through the Mongo translator and execute it.
   * The translator picks `find` vs `aggregate` automatically.
   */
  public select<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'SELECT'>,
  ): Promise<EngineQueryResult<R>> {
    return this.__executeOQL<R>(this.__translator.select(q));
  }

  /**
   * Run an `INSERT` Query. Inserts the document(s), then re-fetches them by
   * `_id` so `data` mirrors SQL `RETURNING`; `count` is the inserted count.
   */
  public insert<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'INSERT'>,
  ): Promise<EngineQueryResult<R>> {
    return this.__executeOQL<R>(this.__translator.insert(q));
  }

  /**
   * Run an `INSERT … SELECT` Query — inserts documents sourced from an
   * embedded read.
   */
  public insertQuery<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(q: Query<'INSERT_FROM_QUERY'>): Promise<EngineQueryResult<R>> {
    return this.__executeOQL<R>(this.__translator.insertQuery(q));
  }

  /**
   * Run an `UPDATE` Query. Emits `updateOne` / `updateMany`; `data` is `[]`
   * and `count` carries the matched (found) document count — SQL
   * affected-rows semantics, not Mongo's `modifiedCount`.
   */
  public update<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'UPDATE'>,
  ): Promise<EngineQueryResult<R>> {
    return this.__executeOQL<R>(this.__translator.update(q));
  }

  /**
   * Run a `DELETE` Query. Emits `deleteOne` / `deleteMany`; `data` is `[]`
   * and `count` carries the deleted-document count.
   */
  public delete<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'DELETE'>,
  ): Promise<EngineQueryResult<R>> {
    return this.__executeOQL<R>(this.__translator.delete(q));
  }

  /**
   * Run an `UPSERT` Query (insert-or-update on the conflict key). Re-fetches
   * the matched-or-inserted document(s) to mirror SQL `RETURNING`.
   */
  public upsert<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'UPSERT'>,
  ): Promise<EngineQueryResult<R>> {
    return this.__executeOQL<R>(this.__translator.upsert(q));
  }

  /**
   * Run a `COUNT` Query. Both the native count and the aggregate-pipeline
   * fallback used for joined counts are normalised to a single `{ Count }` row.
   */
  public async count(
    q: Query<'COUNT'>,
  ): Promise<EngineQueryResult<{ Count: number }>> {
    // Two translator paths land here: the native `count` action
    // already yields `{ Count: n }`, but a JOINED count falls back to
    // an aggregate pipeline that returns `{ _id: {}, __count__: n }`.
    // Normalise BOTH to the public `{ Count }` shape (SQLEngine.count
    // does the same for its `__count__` alias) so callers never see
    // the internal alias.
    const result = await this.__executeOQL<Record<string, unknown>>(
      this.__translator.count(q),
    );
    const row = result.data[0];
    let value = 0;
    if (row !== undefined) {
      if ('Count' in row) {
        value = Number(row.Count ?? 0);
      } else {
        // Aggregate shape: the single non-`_id` field is the count.
        for (const [k, v] of Object.entries(row)) {
          if (k === '_id') continue;
          value = Number(v ?? 0);
          break;
        }
      }
    }
    return { ...result, data: [{ Count: value }] };
  }

  /**
   * Run a `CREATE_TABLE` Query. Mongo collections are schemaless; this
   * emits `createCollection` followed by index creates for PK / uniques.
   */
  public createTable(
    q: Query<'CREATE_TABLE'>,
  ): Promise<EngineQueryResult[]> {
    return this.__runMany(this.__translator.createTable(q));
  }

  /**
   * Run an `ALTER_TABLE` Query. Only `renameTo` produces a command
   * (`renameCollection`) — collections are schemaless, so adding or dropping
   * columns is a no-op that resolves to an empty result array.
   */
  public alterTable(
    q: Query<'ALTER_TABLE'>,
  ): Promise<EngineQueryResult[]> {
    return this.__runMany(this.__translator.alterTable(q));
  }

  /** Run a `DROP_TABLE` Query — drops the backing collection (honors `ifExists`). */
  public dropTable(q: Query<'DROP_TABLE'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.dropTable(q));
  }

  /** Run a `TRUNCATE` Query — removes every document from the collection. */
  public truncate(q: Query<'TRUNCATE'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.truncate(q));
  }

  /** Run a `CREATE_INDEX` Query — creates an index on the collection. */
  public createIndex(q: Query<'CREATE_INDEX'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.createIndex(q));
  }

  /** Run a `DROP_INDEX` Query — drops a named index (Mongo requires the collection). */
  public dropIndex(q: Query<'DROP_INDEX'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.dropIndex(q));
  }

  /**
   * Run a `CREATE_VIEW` Query — creates a Mongo view (`createCollection`
   * with `viewOn` + aggregation pipeline). `materialized` has no effect.
   */
  public createView(q: Query<'CREATE_VIEW'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.createView(q));
  }

  /** Run a `DROP_VIEW` Query — drops the backing view. */
  public dropView(q: Query<'DROP_VIEW'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.dropView(q));
  }

  /** Run an `ALTER_VIEW` Query (multi-statement: drop then recreate the view). */
  public alterView(q: Query<'ALTER_VIEW'>): Promise<EngineQueryResult[]> {
    return this.__runMany(this.__translator.alterView(q));
  }

  /**
   * Run a `REFRESH_MATERIALIZED_VIEW` Query. Mongo has no materialized
   * views, so the translator emits a no-op.
   */
  public refreshMaterializedView(
    q: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.refreshMaterializedView(q));
  }

  /**
   * Run a `CREATE_SCHEMA` Query. Mongo creates databases lazily on first
   * write, so this typically resolves without a server round-trip.
   */
  public createSchema(q: Query<'CREATE_SCHEMA'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.createSchema(q));
  }

  /** Run a `DROP_SCHEMA` Query — drops the named database. */
  public dropSchema(q: Query<'DROP_SCHEMA'>): Promise<EngineQueryResult> {
    return this.__executeOQL(this.__translator.dropSchema(q));
  }

  //#endregion OQL surface

  //#region OQL dispatch

  /**
   * Wrap a translator-emitted {@link MongoAction} into an
   * `EngineQueryResult` by dispatching on `action.sql` and normalising
   * the per-action response into the uniform `{ data, count }` shape.
   */
  private async __executeOQL<R extends Record<string, unknown>>(
    action: MongoAction,
  ): Promise<EngineQueryResult<R>> {
    const id = this._idGenerator('query');
    const startTime = performance.now();
    try {
      const raw = await this.__dispatch<R>(action);
      // Shared timing + `query`/`slowQuery` emit lives on ConnectionEngine. Mongo
      // does not override `_recordQueryStats`, so no stats are accumulated
      // (see the query-stats asymmetry note on the class doc).
      return this._finishQuery<R>(
        id,
        action,
        raw,
        startTime,
        this.__slowThresholdMs,
      );
    } catch (e) {
      throw this.__wrapMongoError(e, action.sql);
    }
  }

  /**
   * Run a translator-emitted action list sequentially. There is no transaction
   * wrapper, so a mid-list failure leaves the earlier actions applied.
   */
  private async __runMany(
    actions: ReadonlyArray<MongoAction>,
  ): Promise<EngineQueryResult[]> {
    const out: EngineQueryResult[] = [];
    for (const a of actions) out.push(await this.__executeOQL(a));
    return out;
  }

  /**
   * Map a translator action to the right Mongo client call and
   * normalize the response to `{ data, count }`. Switching on
   * `action.sql` narrows `action.params` automatically — no casts.
   */
  private async __dispatch<R extends Record<string, unknown>>(
    action: MongoAction,
  ): Promise<{ data: R[]; count: number }> {
    switch (action.sql) {
      case 'noop':
        return { data: [], count: 0 };
      case 'insert': {
        // Mirror SQL RETURNING: re-fetch the inserted documents by their
        // `_id` so callers see the same `result.data` shape they'd get
        // from Postgres / Maria / SQLite.
        const { collection, data } = action.params;
        if (Array.isArray(data)) {
          const ids = await this.insertMany(collection, data);
          if (ids.length === 0) return { data: [], count: 0 };
          const docs = await this.find<R>(collection, {
            _id: { $in: ids },
          });
          return { data: docs, count: ids.length };
        }
        const id = await this.insertOne(collection, data);
        const doc = await this.findOne<R>(collection, { _id: id });
        return { data: doc ? [doc] : [], count: 1 };
      }
      case 'find': {
        const { collection, filter, options } = action.params;
        if (options.findOne) {
          const doc = await this.findOne<R>(collection, filter);
          return { data: doc ? [doc] : [], count: doc ? 1 : 0 };
        }
        const docs = await this.find<R>(collection, filter, options);
        return { data: docs, count: docs.length };
      }
      case 'update': {
        const { collection, filter, data, options } = action.params;
        if (options?.upsert) {
          // UPSERT path. Mirror SQL RETURNING by re-fetching the
          // matched-or-newly-inserted document with the same filter
          // (the OQL upsert builder uses conflict-key-as-filter, so
          // it always identifies exactly one row).
          const c = await this.updateOne(collection, filter, data, {
            upsert: true,
          });
          const doc = await this.findOne<R>(collection, filter);
          return { data: doc ? [doc] : [], count: c };
        }
        if (options?.multiple) {
          const c = await this.updateMany(collection, filter, data);
          return { data: [], count: c };
        }
        const c = await this.updateOne(collection, filter, data);
        return { data: [], count: c };
      }
      case 'bulkWrite': {
        // Bulk UPSERT path. Run all `updateOne` ops in one round-trip
        // via `bulkWrite`, then mirror SQL RETURNING with a single
        // `find($or: [...filters])` — two round-trips total regardless
        // of N. Result ordering follows Mongo's natural order, which
        // matches the bulk INSERT path's `_id: $in` behaviour.
        const { collection, ops } = action.params;
        if (ops.length === 0) return { data: [], count: 0 };
        const c = await this.bulkUpsert(collection, ops);
        const docs = await this.find<R>(collection, {
          $or: ops.map((op) => op.filter),
        });
        return { data: docs, count: c };
      }
      case 'delete': {
        const { collection, filter, options } = action.params;
        if (options?.multiple) {
          const c = await this.deleteMany(collection, filter);
          return { data: [], count: c };
        }
        const c = await this.deleteOne(collection, filter);
        return { data: [], count: c };
      }
      case 'count': {
        const { collection, filter } = action.params;
        const c = await this.countDocuments(collection, filter);
        // Mirror SQL: COUNT returns a single row `{ Count: n }`. The
        // outer `count` field is row-count of `data`, not the COUNT
        // value — same convention as every other op (1 row → count: 1).
        return { data: [{ Count: c } as unknown as R], count: 1 };
      }
      case 'aggregate': {
        const { collection, pipeline } = action.params;
        const docs = await this.aggregate<R>(collection, pipeline);
        return { data: docs, count: docs.length };
      }
      case 'createCollection': {
        const db = await this.db();
        try {
          await db.createCollection(action.params.collection);
        } catch (err) {
          // Collection may already exist; ignore the conflict.
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('already exists')) throw err;
        }
        return { data: [], count: 0 };
      }
      case 'createIndex': {
        const { collection, keys, options } = action.params;
        const col = await this.collection(collection);
        await col.createIndex(keys, options);
        return { data: [], count: 0 };
      }
      case 'dropIndex': {
        const { collection, name } = action.params;
        if (!collection) {
          throw new EngineError('UNSUPPORTED_OPERATION', {
            instanceId: this.instanceId,
            operation: 'dropIndex without collection (Mongo requires it)',
          });
        }
        const col = await this.collection(collection);
        await (col as { dropIndex(name: string): Promise<unknown> }).dropIndex(
          name,
        );
        return { data: [], count: 0 };
      }
      case 'createView': {
        const { view, viewOn, pipeline } = action.params;
        const db = await this.db();
        await (db as {
          createCollection(
            name: string,
            options: Record<string, unknown>,
          ): Promise<unknown>;
        }).createCollection(view, { viewOn, pipeline });
        return { data: [], count: 0 };
      }
      case 'drop': {
        const { collection, options } = action.params;
        const col = await this.collection(collection);
        try {
          await col.drop();
        } catch (err) {
          if (!options?.ifExists) throw err;
        }
        return { data: [], count: 0 };
      }
      case 'renameCollection': {
        const { collection, target } = action.params;
        const col = await this.collection(collection);
        await (col as { rename(target: string): Promise<unknown> }).rename(
          target,
        );
        return { data: [], count: 0 };
      }
      case 'dropDatabase': {
        await (await this.client()).db(action.params.database).dropDatabase();
        return { data: [], count: 0 };
      }
      default: {
        // Exhaustiveness check: every `MongoAction` variant must be
        // handled above. If a new variant is added without updating
        // this switch, TypeScript will complain that it's not assignable
        // to `never`.
        const _exhaustive: never = action;
        throw new EngineError('UNSUPPORTED_OPERATION', {
          instanceId: this.instanceId,
          operation: `Mongo OQL action: ${JSON.stringify(_exhaustive)}`,
        });
      }
    }
  }

  //#endregion OQL dispatch

  //#region Internal helpers

  /**
   * `TDoc` lets each public method declare the document shape it
   * expects so the inner callback receives a `Collection<TDoc>` with
   * `insertOne` / `find` / etc. typed against it — avoids `as any` at
   * every call site. Defaults to `Document` (the npm:mongodb default).
   */
  private async __run<R, TDoc extends Record<string, unknown> = Document>(
    op: string,
    collection: string,
    fn: (col: Collection<TDoc>) => Promise<R>,
  ): Promise<R> {
    await this.connect();
    if (!this.__client) {
      throw new EngineError('NO_CONNECTION', { instanceId: this.instanceId });
    }
    try {
      const col = this.__client.db(this.__defaultDb()).collection<TDoc>(
        collection,
      );
      return await fn(col);
    } catch (e) {
      throw this.__wrapMongoError(e, op);
    }
  }

  /**
   * The configured database name, required for every collection operation.
   *
   * @throws {@link EngineError} `MISSING_CONFIG_VALUE` when `database` is unset
   *   — it is optional at construction because a `uri` may carry it.
   */
  private __defaultDb(): string {
    const db = this._getOption('database');
    if (!db) {
      throw new EngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'database',
      });
    }
    return String(db);
  }

  /**
   * Build a `mongodb://` connection string from the configured options.
   *
   * @throws {EngineError} `INVALID_CONFIG_VALUE` if `host` is not a bare
   *   hostname / IPv4 / bracketed IPv6 (guards against URI injection).
   */
  private __buildUri(): string {
    const explicit = this._getOption('uri');
    if (explicit) return explicit;

    const host = this._getOption('host')!;
    const port = this._getOption('port') ?? 27017;
    const username = this._getOption('username');
    const password = this._getOption('password');
    const database = this._getOption('database');
    const replicaSet = this._getOption('replicaSet');
    const authSource = this._getOption('authSource') ??
      (username ? 'admin' : undefined);

    // `host` is interpolated raw into the URI authority (username,
    // password, and database are percent-encoded). Reject anything that
    // could break out of the host position — a stray `@`, `/`, `?`, `#`,
    // or whitespace would let a malicious host smuggle extra URI options,
    // a different authority, or credentials into the connection string.
    // Bare hostname / IPv4 / bracketed IPv6 only; use the `uri` option
    // for `mongodb+srv://` and multi-host replica-set forms.
    if (!HOST_PATTERN.test(host)) {
      throw new EngineError('INVALID_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'host',
        reason:
          'must be a bare hostname, IPv4, or bracketed IPv6 address; use the "uri" option for mongodb+srv:// or multi-host URIs',
      });
    }

    const auth = username
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password ?? '')}@`
      : '';
    const hostPort = `${host}:${port}`;
    const path = database ? `/${encodeURIComponent(String(database))}` : '/';
    const params = new URLSearchParams();
    if (authSource) params.set('authSource', authSource);
    if (replicaSet) params.set('replicaSet', replicaSet);
    const query = params.toString();
    return `mongodb://${auth}${hostPort}${path}${query ? `?${query}` : ''}`;
  }

  /**
   * Maps a driver error's `code`/`codeName` onto the standard engine error
   * codes, falling back to `OPERATION_FAILED`.
   *
   * @param op - The operation name recorded on the error metadata.
   */
  private __wrapMongoError(e: unknown, op: string): EngineError {
    if (e instanceof EngineError) return e;
    const err = e as { code?: number | string; codeName?: string } & Error;
    const message = err.message ?? String(e);
    let code:
      | 'INVALID_AUTH'
      | 'PERMISSION_DENIED'
      | 'DATABASE_NOT_FOUND'
      | 'TABLE_NOT_FOUND'
      | 'DUPLICATE_KEY'
      | 'CONNECTION_LOST'
      | 'CONNECTION_FAILED'
      | 'OPERATION_FAILED' = 'OPERATION_FAILED';

    // Mongo error codes / codeName mapping.
    if (
      err.codeName === 'AuthenticationFailed' || err.code === 18 ||
      err.code === 'AuthenticationFailed'
    ) {
      code = 'INVALID_AUTH';
    } else if (
      err.codeName === 'Unauthorized' || err.code === 13 ||
      err.code === 'Unauthorized'
    ) {
      code = 'PERMISSION_DENIED';
    } else if (
      err.codeName === 'NamespaceNotFound' || err.code === 26
    ) {
      code = 'TABLE_NOT_FOUND';
    } else if (
      err.codeName === 'DuplicateKey' || err.code === 11000 ||
      err.code === 11001
    ) {
      code = 'DUPLICATE_KEY';
    } else if (
      err.codeName === 'HostNotFound' || err.codeName === 'NetworkTimeout' ||
      message.includes('ECONNREFUSED') || message.includes('ECONNRESET')
    ) {
      code = op === 'connect' ? 'CONNECTION_FAILED' : 'CONNECTION_LOST';
    }

    return new EngineError(
      code,
      {
        instanceId: this.instanceId,
        operation: op,
        reason: message,
        driverCode: err.code,
        driverCodeName: err.codeName,
      } as never,
      err,
    );
  }

  //#endregion Internal helpers
}

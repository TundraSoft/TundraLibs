/**
 * @module
 *
 * The engine base hierarchy for `@tundralibs/drivers` lives here:
 *
 * - {@link ConnectionEngine} is the **pool-free root**. It owns the concerns
 *   every driver shares regardless of how it talks to its backend: a typed
 *   status state machine (`CLOSED → CONNECTING → READY → CLOSED`), identity
 *   (`Engine::Name`), the connection-level event surface, capabilities, option
 *   loading + validation (including SSL/TLS shape checks), the query-result
 *   assembly helpers, and a set of **overridable resource seams**. Its default
 *   `connect` / `disconnect` / `ping` drive `_open` / `_close` / `_ping`, and
 *   its default resource seams model a single, non-pooled connection
 *   (`_acquire` hands out one lazily-established resource; `_release` /
 *   `_destroy` are no-ops; `_validateResource` is always `true`). Engines that
 *   manage their own connections — e.g. `MongoEngine`, whose `MongoClient`
 *   pools internally, or future edge/serverless HTTP drivers that are
 *   fetch/stateless — extend this directly and never drag in the socket pool.
 *
 * - {@link PooledConnectionEngine} extends the root with the socket
 *   {@link ConnectionPool}. It composes a pool (wiring its
 *   `_createResource` / `_destroyResource` / `_validateResource` / `_ping`
 *   hooks) and overrides `connect` / `disconnect` / `ping` +
 *   `_acquire` / `_release` / `_destroy` + `_ensureMin` / `_drain` to delegate
 *   to it. This is the class historically named `BaseEngine` — the engine that
 *   *has* a pool — and it is still exported under that name (see `BaseEngine.ts`
 *   / `mod.ts`) so `extends BaseEngine` keeps working unchanged.
 *
 * Single-connection mode (no `pool` option configured) keeps exactly one
 * connection — useful when fronting a server-side pooler like PgBouncer where
 * any driver-side pool would just create pool-on-pool. Configure
 * `pool: { min, max }` for multi-connection.
 *
 * Subclasses (e.g. `SQLEngine`, `RedisEngine`, `MemcachedEngine`) extend
 * `PooledConnectionEngine` with their own domain abstractions — transactions,
 * query execution, key/value semantics, etc.
 */

import { type EventOptionKeys, Options } from '@tundralibs/utils/Options';
import { ulid } from '@tundralibs/id/ulid';

import { EngineError } from './errors/mod.ts';
import {
  ConnectionPool,
  validatePoolOptions,
  type Waiter,
} from './ConnectionPool.ts';
import {
  createEnginePool,
  poolConnect,
  poolDisconnect,
  type PooledHost,
  poolPing,
  poolStatsSnapshot,
} from './poolLifecycle.ts';
import type {
  EngineCapabilities,
  EngineEvents,
  EngineOptions,
  EnginePoolStats,
  EngineQuery,
  EngineQueryResult,
  EngineStatus,
} from './types/mod.ts';

/** Default ID generator: ULID with optional prefix. */
const defaultIdGenerator = (prefix?: string): string => {
  if (prefix && prefix.length > 0) {
    return `${prefix.trim()}-${ulid()}`;
  }
  return ulid();
};

/**
 * Pool-free root for every driver engine.
 *
 * Owns lifecycle, identity, events, capabilities, status, options, and the
 * shared query-result helpers, but knows nothing about connection pooling.
 * Its `connect` / `disconnect` / `ping` drive the overridable
 * `_open` / `_close` / `_ping` seams, and its resource seams
 * (`_acquire` / `_release` / `_destroy` / `_validateResource`) model a single,
 * non-pooled connection. {@link PooledConnectionEngine} layers the socket pool
 * on top; engines that pool elsewhere (Mongo's `MongoClient`, edge HTTP
 * drivers) extend this directly.
 *
 * @template T - The underlying connection resource type (e.g. `TcpConn`, a
 *   driver-specific client object).
 * @template O - Engine-specific options, must extend `EngineOptions`.
 * @template E - Engine-specific events, must extend `EngineEvents`.
 */
export abstract class ConnectionEngine<
  T = unknown,
  O extends EngineOptions = EngineOptions,
  E extends EngineEvents = EngineEvents,
> extends Options<O, E> {
  //#region Identity & capabilities

  /** Engine name (e.g. 'POSTGRES', 'REDIS'). Set by concrete subclass. */
  public abstract readonly Engine: string;

  /** Capabilities declaration. Set by concrete subclass. */
  public abstract readonly Capabilities: EngineCapabilities;

  /** Connection name supplied by the caller. */
  public readonly Name: string;

  /** Unique instance identifier in the form `Engine::Name`. */
  public get instanceId(): string {
    return `${this.Engine}::${this.Name}`;
  }

  //#endregion Identity & capabilities

  //#region Engine state

  /** Current connection status. */
  protected _status: EngineStatus = 'CLOSED';

  /** ID generator used for queries, transactions, and other entities. */
  protected _idGenerator: (prefix?: string) => string;

  /**
   * The single non-pooled resource for the default (pool-free) seams. Left
   * `undefined` until a subclass's `_open` establishes it. Pooled engines
   * never touch this — {@link PooledConnectionEngine} overrides the resource
   * seams to delegate to its pool.
   */
  protected _resource: T | undefined;

  //#endregion Engine state

  /**
   * Validates and stores options; opens no connection — call
   * {@link ConnectionEngine.connect} (or issue a query) for that.
   *
   * @param name - Connection name for this engine instance; trimmed, and forms
   *   the second half of {@link ConnectionEngine.instanceId}
   * @param options - Engine options + event handlers
   * @param defaults - Subclass-supplied defaults (caller options win)
   *
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` when an option fails
   *   validation in {@link ConnectionEngine._processOption}
   */
  constructor(
    name: string,
    options?: EventOptionKeys<O, E>,
    defaults?: Partial<O>,
  ) {
    super();
    this.Name = name.trim();
    this._setOptions({
      idGenerator: defaultIdGenerator,
      ...defaults,
      ...options,
    } as EventOptionKeys<O, E>);
    this._idGenerator = this._getOption('idGenerator')!;
  }

  //#region Public API

  /** Current engine status. */
  public get status(): EngineStatus {
    return this._status;
  }

  /**
   * Snapshot of pool statistics. The pool-free root holds no pool, so it
   * reports an empty snapshot; {@link PooledConnectionEngine} overrides this
   * to return its live pool stats.
   */
  public get poolStats(): EnginePoolStats {
    return { total: 0, active: 0, idle: 0, waiting: 0 };
  }

  /**
   * Establish the underlying connection.
   *
   * Idempotent: returns immediately if not `CLOSED`. On failure, status is
   * reset to `CLOSED` and a `CONNECTION_FAILED` error is thrown. Drives the
   * overridable {@link _open} seam.
   *
   * @emits connect - On successful connection
   * @emits connectionFailed - On connection failure
   */
  public async connect(): Promise<void> {
    if (this._status !== 'CLOSED') return;
    try {
      this._status = 'CONNECTING';
      await this._open();
      this._status = 'READY';
      this._emitRaw('connect', this.instanceId);
    } catch (e) {
      this._status = 'CLOSED';
      const error = e instanceof EngineError ? e : new EngineError(
        'CONNECTION_FAILED',
        { instanceId: this.instanceId },
        e as Error,
      );
      this._emitRaw('connectionFailed', this.instanceId, error);
      throw error;
    }
  }

  /**
   * Close the underlying connection.
   *
   * Idempotent: returns immediately if already closed. Drives the overridable
   * {@link _close} seam.
   *
   * @emits disconnect - On successful disconnection
   * @emits error - On disconnection failure
   */
  public async disconnect(): Promise<void> {
    if (this._status === 'CLOSED') return;
    try {
      await this._close();
      this._status = 'CLOSED';
      this._emitRaw('disconnect', this.instanceId);
    } catch (e) {
      const error = e instanceof EngineError ? e : new EngineError(
        'DISCONNECTION_FAILED',
        { instanceId: this.instanceId },
        e as Error,
      );
      this._emitRaw('error', this.instanceId, error);
      throw error;
    }
  }

  /**
   * Liveness check. Acquires a resource, runs the engine-specific ping, and
   * releases it.
   *
   * Returns `false` (rather than throwing) if the engine is closed or the
   * ping itself fails — callers can poll without try/catch ceremony.
   */
  public async ping(): Promise<boolean> {
    if (this._status === 'CLOSED') return false;
    let resource: T | undefined;
    try {
      resource = await this._acquire();
      return await this._ping(resource);
    } catch {
      return false;
    } finally {
      if (resource !== undefined) this._release(resource);
    }
  }

  //#endregion Public API

  //#region Connection lifecycle seams (pool-free)

  /**
   * Establish the connection. Default no-op — override in a non-pooled
   * subclass to open the underlying transport (and typically assign
   * {@link _resource}). Driven by {@link connect}.
   */
  protected _open(): Promise<void> | void {}

  /**
   * Tear down the connection. Default no-op — override in a non-pooled
   * subclass to close the underlying transport. Driven by {@link disconnect}.
   */
  protected _close(): Promise<void> | void {}

  //#endregion Connection lifecycle seams

  //#region Resource seams (pool-free defaults)

  /**
   * Acquire a connection resource. The pool-free default hands out the single
   * {@link _resource} established by {@link _open}. Pooled engines override
   * this to check one out of the pool; subclasses that acquire MUST call
   * `_release` (or `_destroy`) exactly once per acquired resource, ideally in
   * a `try/finally`.
   */
  protected _acquire(_timeoutMs?: number): Promise<T> | T {
    return this._resource as T;
  }

  /**
   * Return a resource. No-op in the pool-free default (the single connection
   * is not recycled). Pooled engines override this to return it to the pool.
   */
  protected _release(_resource: T): void {}

  /**
   * Forcefully dispose of a resource. No-op in the pool-free default. Pooled
   * engines override this to remove and destroy the resource.
   */
  protected _destroy(_resource: T): Promise<void> | void {}

  /**
   * Validate a resource before it is handed back out. Default always returns
   * `true`. Override to implement health checks (e.g. is the underlying socket
   * still open?).
   */
  protected _validateResource(_resource: T): Promise<boolean> | boolean {
    return true;
  }

  /**
   * Run an engine-specific liveness check on `resource`. Default returns
   * `true`. Also used as the pool's `ping` hook in
   * {@link PooledConnectionEngine}.
   */
  protected _ping(_resource: T): Promise<boolean> | boolean {
    return true;
  }

  //#endregion Resource seams

  //#region Option enforcement

  /**
   * Assert that each named option was supplied, throwing a
   * `MISSING_CONFIG_VALUE` {@link EngineError} on the first that is absent.
   * Call from a subclass constructor after `super(...)` to enforce required
   * connection config (e.g. `this._requireOptions(['host', 'database'])`).
   */
  protected _requireOptions(keys: readonly string[]): void {
    for (const key of keys) {
      if (this.hasOption(key as keyof O) === false) {
        throw new EngineError('MISSING_CONFIG_VALUE', {
          instanceId: this.instanceId,
          option: key,
        });
      }
    }
  }

  //#endregion Option enforcement

  //#region Query result assembly (shared by query-executing subclasses)

  /**
   * Assemble and dispatch the result of a completed query: compute the
   * wall-clock `time` and slow-query flag, record stats via
   * {@link _recordQueryStats}, build the {@link EngineQueryResult}, emit
   * `query` (and `slowQuery` when over the threshold), and return it.
   *
   * Shared by `SQLEngine.execute` and `MongoEngine`'s OQL dispatch so the
   * timing + emit sequence lives in exactly one place. Callers own the
   * `id` / `startTime` capture (which must happen *before* the wire op)
   * and pass their resolved `slowThresholdMs`.
   *
   * @param id - Pre-generated execution id.
   * @param query - The (standardized) query that ran.
   * @param raw - The `{ data, count }` produced by the driver.
   * @param startTime - `performance.now()` captured before dispatch.
   * @param slowThresholdMs - Slow-query threshold in milliseconds.
   * @param transactionId - Owning transaction id, if any.
   */
  protected _finishQuery<R extends Record<string, unknown>>(
    id: string,
    query: EngineQuery,
    raw: { data: R[]; count: number },
    startTime: number,
    slowThresholdMs: number,
    transactionId?: string,
  ): EngineQueryResult<R> {
    const time = performance.now() - startTime;
    const isSlow = time > slowThresholdMs;
    const result: EngineQueryResult<R> = {
      id,
      query,
      data: raw.data,
      count: raw.count,
      time,
      isSlow,
      transactionId,
    };
    this._recordQueryStats(time, isSlow, true);
    // `query` / `slowQuery` are declared on the query-executing subclasses'
    // event maps (SQL/Mongo), not on the base `EngineEvents` this class is
    // generic over — cast the key so the shared helper can emit them.
    this._emitRaw('query' as keyof E, this.instanceId, result);
    if (isSlow) this._emitRaw('slowQuery' as keyof E, this.instanceId, result);
    return result;
  }

  /**
   * Hook invoked by {@link _finishQuery} for every completed query (and
   * called directly by engines on their failure path) so subclasses that
   * accumulate query statistics can record one. Default is a no-op:
   * `SQLEngine` overrides it to update its `_queryStats`; `MongoEngine`
   * intentionally does not (it emits events only — see its class doc).
   */
  protected _recordQueryStats(
    _timeMs: number,
    _isSlow: boolean,
    _success: boolean,
  ): void {}

  //#endregion Query result assembly

  //#region Option processing

  /**
   * Validates the options common to every engine (`idGenerator`, `host`,
   * `port`, `database`, `username`, `password`, `pool`, `ssl`) and returns the
   * value unchanged. Subclasses override this to add their own keys and must
   * delegate unknown ones back here.
   *
   * `host`/`username`/`password` accept `undefined` — whether `host` is
   * mandatory is decided per engine, not here.
   *
   * `K` is bounded by `keyof O`, not `keyof EngineOptions`, so a subclass
   * that widens `O` with its own option names can delegate straight back
   * here without casting the key.
   *
   * @returns The validated value, unmodified.
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` for any value that
   *   fails its check.
   *
   * @internal
   */
  protected override _processOption<K extends keyof O>(
    key: K,
    value: O[K],
  ): O[K] {
    // Switch on the key narrowed to the common option names rather than on
    // `key` itself: `keyof O` is an unresolved type parameter here, so it
    // offers no literals to complete or narrow against, while this concrete
    // union does. Purely a type-level narrowing — erased at runtime.
    const optionKey = key as keyof EngineOptions;
    switch (optionKey) {
      case 'idGenerator':
        if (
          typeof value !== 'function' ||
          typeof (value as (p?: string) => unknown)() !== 'string'
        ) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: optionKey,
            reason: 'must be a function returning a string',
          });
        }
        break;
      case 'host':
      case 'username':
      case 'password':
        // username/password are optional — treat undefined as "not set".
        // host is required, but its required-ness is enforced per-engine
        // (subclasses throw MISSING_CONFIG_VALUE when needed).
        if (value === undefined) break;
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: optionKey,
            reason: 'must be a non-empty string',
          });
        }
        break;
      case 'database':
        // Most engines use string DB names; Redis uses a numeric index.
        if (
          typeof value === 'string'
            ? value.trim().length === 0
            : typeof value !== 'number' ||
              !Number.isInteger(value) ||
              value < 0
        ) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: optionKey,
            reason:
              'must be a non-empty string or a non-negative integer (database index)',
          });
        }
        break;
      case 'port':
        if (
          typeof value !== 'number' ||
          Number.isNaN(value) ||
          !Number.isInteger(value) ||
          value <= 0 || value > 65535
        ) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: optionKey,
            reason: 'must be an integer between 1 and 65535',
          });
        }
        break;
      case 'pool':
        if (!validatePoolOptions(value)) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: optionKey,
            reason:
              'must be an object with optional positive integer "min", "max" (min ≤ max), idleTimeoutSeconds, acquireTimeoutSeconds',
          });
        }
        break;
      case 'ssl':
        if (!_validateSslOptions(value)) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: optionKey,
            reason:
              'must be a boolean or an object with optional "cert"/"key" (string), "ca" (string[]), "certFile"/"keyFile"/"caFile" (string), "rejectUnauthorized" / "enforce" (boolean)',
          });
        }
        break;
    }
    // The `Options` base declares this hook non-generically (`key: keyof O`),
    // so it returns the whole `O[keyof O]` union. This is the one boundary
    // where the generic chain meets that non-generic base — subclass
    // overrides below delegate to *this* generic signature and need no cast.
    return super._processOption(key, value) as O[K];
  }

  //#endregion Option processing
}

/**
 * Abstract base for pooled driver engines — the class historically named
 * `BaseEngine`.
 *
 * Extends {@link ConnectionEngine} with a composed {@link ConnectionPool}:
 * the engine holds a pool rather than being one, wiring the pool's four
 * resource operations to this class's abstract
 * `_createResource` / `_destroyResource` / `_validateResource` / `_ping`, and
 * delegating its connection-lifecycle (`connect` / `disconnect` / `ping`) and
 * acquire / release / drain seams to it.
 *
 * @template T - The underlying connection resource type held by the pool.
 * @template O - Engine-specific options, must extend `EngineOptions`.
 * @template E - Engine-specific events, must extend `EngineEvents`.
 */
export abstract class PooledConnectionEngine<
  T = unknown,
  O extends EngineOptions = EngineOptions,
  E extends EngineEvents = EngineEvents,
> extends ConnectionEngine<T, O, E> {
  //#region Pool

  /**
   * The connection pool. This engine composes it rather than being it: its
   * sizing knobs are resolved from the `pool` option and its four resource
   * operations are wired to this class's abstract
   * `_createResource` / `_destroyResource` / `_validateResource` / `_ping`.
   * The connection-lifecycle methods below delegate their acquire / release
   * / drain seams to this instance.
   */
  protected readonly _pool: ConnectionPool<T>;

  /**
   * This engine viewed as a {@link PooledHost} for the shared lifecycle
   * helpers in `poolLifecycle.ts`. It **is** `this` (no wrapper, no copy); the
   * cast only re-types the `protected` members those helpers reach — `_pool`
   * stays `protected` on the class. See `poolLifecycle.ts` for why the pooled
   * `connect` / `disconnect` / `ping` logic is single-sourced there.
   */
  private readonly __host: PooledHost<T> = this as unknown as PooledHost<T>;

  //#endregion Pool

  /**
   * Builds the pool from the resolved `pool` option and wires it to this
   * class's resource seams. The pool starts empty — no socket is opened until
   * {@link PooledConnectionEngine.connect}.
   *
   * @param name - Connection name for this engine instance
   * @param options - Engine options + event handlers
   * @param defaults - Subclass-supplied defaults (caller options win)
   *
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` when an option fails
   *   validation in {@link ConnectionEngine._processOption}
   */
  constructor(
    name: string,
    options?: EventOptionKeys<O, E>,
    defaults?: Partial<O>,
  ) {
    super(name, options, defaults);
    this._pool = createEnginePool<T>(this._getOption('pool'), {
      // `instanceId` is read lazily: the subclass's `Engine` field is only
      // initialized after this `super()` returns, so it can't be captured here.
      instanceId: () => this.instanceId,
      create: () => this._createResource(),
      destroy: (resource) => this._destroyResource(resource),
      validate: (resource) => this._validateResource(resource),
      ping: (resource) => this._ping(resource),
      onWarn: (message) => this._emitRaw('warn', this.instanceId, message),
    });
  }

  //#region Public API

  /** Snapshot of pool statistics. */
  public override get poolStats(): EnginePoolStats {
    return poolStatsSnapshot(this.__host);
  }

  /**
   * Establish the underlying connection pool.
   *
   * Idempotent: returns immediately if already connected. On failure, status
   * is reset to `CLOSED` and a `CONNECTION_FAILED` error is thrown. The pooled
   * connect logic (warm-up, the drain-in-catch, the disconnect/connect race
   * guard, the emit sequence) is single-sourced in {@link poolConnect}.
   *
   * @emits connect - On successful connection
   * @emits connectionFailed - On connection failure
   */
  public override connect(): Promise<void> {
    return poolConnect(this.__host);
  }

  /**
   * Drain the pool and close every underlying connection.
   *
   * Idempotent: returns immediately if already closed. Delegates to the
   * single-sourced {@link poolDisconnect}.
   *
   * @emits disconnect - On successful disconnection
   * @emits error - On disconnection failure
   */
  public override disconnect(): Promise<void> {
    return poolDisconnect(this.__host);
  }

  /**
   * Liveness check delegated to the pool via {@link poolPing}.
   *
   * Returns `false` (rather than throwing) if the engine is closed or the
   * ping itself fails — callers can poll without try/catch ceremony.
   */
  public override ping(): Promise<boolean> {
    return poolPing(this.__host);
  }

  //#endregion Public API

  //#region Connection acquisition (delegated to the pool)

  /**
   * Acquire one connection from the pool. Subclasses call this to check out
   * a resource; they MUST call `_release` (or `_destroy`) exactly once per
   * acquired resource, ideally in a `try/finally`.
   *
   * @param timeoutMs - Override the default acquire timeout for this call.
   * @throws {EngineError} `POOL_DRAINING` if the pool is draining.
   * @throws {EngineError} `POOL_ACQUIRE_TIMEOUT` if the timeout elapses while
   *   queued; or whatever the factory throws when creating a new resource.
   */
  protected override _acquire(timeoutMs?: number): Promise<T> {
    return this._pool.acquire(timeoutMs);
  }

  /**
   * Return a resource to the pool. If a queued acquirer is waiting, the pool
   * validates and hands the resource to it; otherwise it goes back to the
   * idle list. Calling with a resource not owned by the pool is a no-op.
   */
  protected override _release(resource: T): void {
    this._pool.release(resource);
  }

  /**
   * Forcefully remove and destroy a resource (e.g. after a transport error).
   * Use this instead of `_release` when the resource cannot be reused; the
   * freed slot backfills any queued waiter with a fresh one.
   */
  protected override _destroy(resource: T): Promise<void> {
    return this._pool.destroy(resource);
  }

  //#region Pool introspection seams

  // The pool owns the acquire/release state machine; these thin accessors
  // re-expose the bits the connection lifecycle (and the pool test-suite,
  // which drives the state machine directly) reach for. Reading `_idle` /
  // `_waiters` returns the pool's live containers by reference.

  /** Whether the pool is draining. Flipped by connect / disconnect. */
  protected get _draining(): boolean {
    return this._pool.draining;
  }
  protected set _draining(value: boolean) {
    this._pool.draining = value;
  }

  /** Live idle-resource list held by the pool (by reference). */
  protected get _idle(): T[] {
    return this._pool.idle;
  }

  /** Live waiter queue held by the pool (by reference). */
  protected get _waiters(): Waiter<T>[] {
    return this._pool.waiters;
  }

  /** Number of factory calls currently in flight in the pool. */
  protected get _pending(): number {
    return this._pool.pending;
  }

  //#endregion Pool introspection seams

  //#endregion Connection acquisition

  //#region Pool internals (delegated to the pool)

  /** Pre-create `min` resources so the pool is warm. */
  protected _ensureMin(): Promise<void> {
    return this._pool.ensureMin();
  }

  /**
   * Stop accepting new acquires, reject pending waiters, and destroy all
   * idle resources. Active resources are destroyed when their owners
   * release them.
   */
  protected _drain(): Promise<void> {
    return this._pool.drain();
  }

  //#endregion Pool internals

  //#region Abstract — subclass must implement

  /** Construct one new resource. Called by `_acquire` and `_ensureMin`. */
  protected abstract _createResource(): Promise<T> | T;

  /** Dispose of a resource. Called by `_release`/`_destroy`/`_drain`. */
  protected abstract _destroyResource(resource: T): Promise<void> | void;

  /** Run an engine-specific liveness check on `resource`. */
  protected abstract override _ping(resource: T): Promise<boolean> | boolean;

  //#endregion Abstract — subclass must implement
}

//#region Local validators

/**
 * Construction-time shape check for `ssl`. Just verifies field types
 * — PEM-format validation and file-existence checks happen at connect
 * time inside `compat.connect` / `compat.upgradeTls` (or in the
 * engine's `_createResource` for delegated drivers).
 */
function _validateSslOptions(value: unknown): value is EngineOptions['ssl'] {
  if (value === undefined) return true;
  if (typeof value === 'boolean') return true;
  if (typeof value !== 'object' || value === null) return false;
  const ssl = value as Record<string, unknown>;
  // PEM-string fields.
  if (ssl.cert !== undefined && typeof ssl.cert !== 'string') return false;
  if (ssl.key !== undefined && typeof ssl.key !== 'string') return false;
  if (ssl.ca !== undefined) {
    if (!Array.isArray(ssl.ca)) return false;
    if (ssl.ca.some((c) => typeof c !== 'string')) return false;
  }
  // File-path fields.
  if (ssl.certFile !== undefined && typeof ssl.certFile !== 'string') {
    return false;
  }
  if (ssl.keyFile !== undefined && typeof ssl.keyFile !== 'string') {
    return false;
  }
  if (ssl.caFile !== undefined && typeof ssl.caFile !== 'string') return false;
  // Boolean knobs.
  if (
    ssl.rejectUnauthorized !== undefined &&
    typeof ssl.rejectUnauthorized !== 'boolean'
  ) {
    return false;
  }
  if (ssl.enforce !== undefined && typeof ssl.enforce !== 'boolean') {
    return false;
  }
  return true;
}

//#endregion Local validators

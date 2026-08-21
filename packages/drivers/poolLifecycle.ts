/**
 * @module
 *
 * **Single-sourced pooled-engine connection lifecycle.**
 *
 * Two pooled engine classes exist in this package — {@link PooledConnectionEngine}
 * (in `ConnectionEngine.ts`) and {@link SQLEngine} (in `SQLEngine.ts`) — and
 * they sit on *different* pool-free roots (`ConnectionEngine` vs the SQL
 * surface `SQLConnectionEngine`). That "diamond" means no shared parent can
 * hold the pooled lifecycle, so historically each class carried a
 * byte-parallel copy of the same `connect` / `disconnect` / `ping` / pool
 * wiring. A round-2 review found a fix applied to one twin (the warm-up drain
 * and the disconnect/connect race guard) silently missed the other.
 *
 * This module collapses that duplication: the divergence-prone logic
 * (idempotency guard, warm-up, the drain-in-catch that reclaims a partially
 * warmed pool, the `_draining` re-check before flipping to `READY`, the emit
 * sequence, and `CONNECTION_FAILED` / `DISCONNECTION_FAILED` wrapping) lives
 * here exactly once. Both engine classes reduce to thin delegators
 * (`connect() { return poolConnect(this.__host); }`), so a future lifecycle fix
 * touches one function and can never diverge again.
 *
 * The helpers operate on a minimal {@link PooledHost} surface rather than a
 * concrete class, precisely because the two engines share no base. Each engine
 * exposes itself as a host (its lifecycle-relevant members line up with the
 * interface one-to-one). Behaviour is byte-identical to the two former copies.
 *
 * **Edge-safe:** imports only {@link ConnectionPool}, {@link EngineError}, and
 * types — nothing that reaches a socket, a wire protocol, a native binding, or
 * a `node:*` builtin — so it stays inside the Neon/Turso edge graphs (both edge
 * engines extend the pool-free `SQLConnectionEngine`, which lives beside the
 * pooled `SQLEngine` that imports this module).
 */

import { ConnectionPool } from './ConnectionPool.ts';
import { EngineError } from './errors/mod.ts';
import type {
  EnginePoolOptions,
  EnginePoolStats,
  EngineStatus,
} from './types/mod.ts';

/**
 * The minimal surface a pooled engine exposes to the shared lifecycle helpers.
 *
 * The member names mirror the (mostly `protected`) engine members one-to-one,
 * so an engine satisfies this by casting itself once
 * (`this as unknown as PooledHost<T>`) — the host **is** the engine, not a
 * wrapper, so every access reads/writes the real field and every call binds
 * the real method. The cast is needed only because an interface cannot restate
 * `protected` members (`_pool` stays `protected` on each class); it introduces
 * no indirection and no behavioural change.
 *
 * @template T - The underlying connection resource type held by the pool.
 */
export interface PooledHost<T> {
  /** The composed connection pool (stays `protected` on the engine). */
  readonly _pool: ConnectionPool<T>;
  /** The engine's mutable status field (`_status`). */
  _status: EngineStatus;
  /** The engine's `Engine::Name` identity. */
  readonly instanceId: string;
  /** The engine's typed event emitter (`Events#_emit`). */
  _emit(event: string, ...args: unknown[]): unknown;
  /** Pre-create `min` resources so the pool is warm. */
  _ensureMin(): Promise<void>;
  /** Stop accepting acquires, reject waiters, destroy idle resources. */
  _drain(): Promise<void>;
  /** Pool draining flag (accessor pair backed by `_pool.draining`). */
  _draining: boolean;
}

/**
 * Resource hooks a pooled engine wires into its {@link ConnectionPool} — bound
 * references to the engine's abstract `_createResource` / `_destroyResource` /
 * `_validateResource` / `_ping`, its lazy `instanceId`, and its `warn` emit.
 *
 * @template T - The underlying connection resource type held by the pool.
 */
export interface EnginePoolHooks<T> {
  /** Lazily resolve the engine's `Engine::Name` (unset during `super()`). */
  instanceId: () => string;
  /** Construct one new resource. */
  create: () => Promise<T> | T;
  /** Dispose of a resource. */
  destroy: (resource: T) => Promise<void> | void;
  /** Validate a resource before it is handed back out. */
  validate: (resource: T) => Promise<boolean> | boolean;
  /** Engine-specific liveness check on a resource. */
  ping: (resource: T) => Promise<boolean> | boolean;
  /** Surface a warning message through the engine's event system. */
  onWarn: (message: string) => void;
}

/**
 * Build the engine's {@link ConnectionPool} from its resolved `pool` option and
 * resource hooks. Shared so both pooled engines wire the pool identically.
 *
 * @param poolOption - The engine's raw `pool` option (`undefined` ⇒ single
 *   connection mode).
 * @param hooks - Resource operations + identity/warn wiring.
 */
export function createEnginePool<T>(
  poolOption: EnginePoolOptions | undefined,
  hooks: EnginePoolHooks<T>,
): ConnectionPool<T> {
  return new ConnectionPool<T>({
    ...ConnectionPool.resolveOptions(poolOption),
    instanceId: hooks.instanceId,
    create: hooks.create,
    destroy: hooks.destroy,
    validate: hooks.validate,
    ping: hooks.ping,
    onWarn: hooks.onWarn,
  });
}

/** Snapshot of the host pool's statistics. */
export function poolStatsSnapshot<T>(host: PooledHost<T>): EnginePoolStats {
  return host._pool.stats();
}

/**
 * Establish the underlying connection pool.
 *
 * Idempotent: returns immediately if not `CLOSED`. On failure, status is reset
 * to `CLOSED` and a `CONNECTION_FAILED` {@link EngineError} is thrown.
 *
 * @throws {@link EngineError} With code `CONNECTION_FAILED` when warming the
 *   pool (`_ensureMin`) fails; a non-{@link EngineError} cause is wrapped, an
 *   error that is already an {@link EngineError} is rethrown as-is.
 * @emits connect - On successful connection.
 * @emits connectionFailed - On connection failure.
 */
export async function poolConnect<T>(host: PooledHost<T>): Promise<void> {
  if (host._status !== 'CLOSED') return;
  try {
    host._status = 'CONNECTING';
    host._draining = false;
    await host._ensureMin();
    // A `disconnect()` can land while the `ensureMin` above awaits its
    // in-flight warm creations: `drain()` never awaits those creations, so it
    // completes; the creations then observe the draining flag, self-destroy,
    // and resolve normally, so `ensureMin` resolves too. Flipping to READY
    // here would strand a draining pool — status READY but every `_acquire`
    // throws POOL_DRAINING forever, and a recovery `connect()` early-returns
    // on status !== 'CLOSED'. Re-check for that intervening disconnect and
    // honour it instead. No `await` sits between this check and the READY
    // assignment, so the window is closed. `_drain` is a no-op when already
    // draining; `.catch` keeps it from masking the disconnect.
    if (host._draining) {
      await host._drain().catch(() => {});
      host._status = 'CLOSED';
      return;
    }
    host._status = 'READY';
    host._emit('connect', host.instanceId);
  } catch (e) {
    // A partial warm-up leaks: `ensureMin`'s `Promise.all` rejects on the
    // first failed creation, but siblings that already resolved have pushed
    // live connections into the pool's idle list, and their `idle + active`
    // count sits at/under `min` so no idle-eviction timer ever arms. Once we
    // set CLOSED below, `disconnect()` early-returns — so those sockets would
    // survive until process exit. Drain here to reclaim them. `.catch` keeps
    // a drain failure from masking the original connect error, and `connect`
    // resets `_draining` before the next `ensureMin`, so retries still work.
    await host._drain().catch(() => {});
    host._status = 'CLOSED';
    const error = e instanceof EngineError ? e : new EngineError(
      'CONNECTION_FAILED',
      { instanceId: host.instanceId },
      e as Error,
    );
    host._emit('connectionFailed', host.instanceId, error);
    throw error;
  }
}

/**
 * Drain the pool and close every underlying connection.
 *
 * Idempotent: returns immediately if already closed. Callers that must run
 * teardown *before* the idempotency guard (e.g. a SQL engine rolling back
 * active transactions) do that in their own method before delegating here.
 *
 * @throws {@link EngineError} With code `DISCONNECTION_FAILED` when draining
 *   the pool (`_drain`) fails; a non-{@link EngineError} cause is wrapped, an
 *   error that is already an {@link EngineError} is rethrown as-is.
 * @emits disconnect - On successful disconnection.
 * @emits error - On disconnection failure.
 */
export async function poolDisconnect<T>(host: PooledHost<T>): Promise<void> {
  if (host._status === 'CLOSED') return;
  try {
    await host._drain();
    host._status = 'CLOSED';
    host._emit('disconnect', host.instanceId);
  } catch (e) {
    const error = e instanceof EngineError ? e : new EngineError(
      'DISCONNECTION_FAILED',
      { instanceId: host.instanceId },
      e as Error,
    );
    host._emit('error', host.instanceId, error);
    throw error;
  }
}

/**
 * Liveness check delegated to the pool.
 *
 * Returns `false` (rather than throwing) if the engine is closed or the ping
 * itself fails — callers can poll without try/catch ceremony.
 */
export async function poolPing<T>(host: PooledHost<T>): Promise<boolean> {
  if (host._status === 'CLOSED') return false;
  return await host._pool.ping();
}

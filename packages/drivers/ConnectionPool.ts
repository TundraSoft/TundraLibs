/**
 * @module
 *
 * `ConnectionPool<T>` is the standalone socket-pool used by
 * `@tundralibs/drivers` engines. It was lifted verbatim out of
 * `BaseEngine` — the engine used to *be* the pool — and now lives here as
 * a composed helper: an engine holds a `ConnectionPool<T>` instance and
 * delegates its `connect`/`disconnect`/`_acquire`/`_release`/`_destroy`
 * seams to it.
 *
 * The pool is deliberately unaware of the engine. Everything it needs to
 * do its job arrives through {@link ConnectionPoolOptions} constructor
 * hooks: the resolved sizing knobs (`min` / `max` / `idleTimeoutMs` /
 * `acquireTimeoutMs`), the four resource operations bound to the engine's
 * `_createResource` / `_destroyResource` / `_validateResource` / `_ping`
 * (`create` / `destroy` / `validate` / `ping`), a lazy `instanceId`
 * accessor for error context, and an `onWarn` callback the pool uses to
 * surface pool-saturation / re-warm warnings (the engine wires it to its
 * own `warn` event).
 *
 * Single-connection mode (`min: 1, max: 1, idleTimeoutMs: 0`) keeps exactly
 * one connection — useful when fronting a server-side pooler like PgBouncer
 * where any driver-side pool would just create pool-on-pool. Multi-connection
 * mode is configured with `min` / `max` above one.
 *
 * The acquire / release / hand-off / idle-eviction paths are the most
 * race-sensitive code in the package; every `settled` flag, `_pending`
 * invariant, and hand-off claim is load-bearing. See the inline comments.
 */

import { EngineError } from './errors/mod.ts';
import type { EnginePoolOptions, EnginePoolStats } from './types/mod.ts';

/** Default pool config when caller does not supply `pool` — single connection. */
const SINGLE_CONNECTION_POOL = {
  min: 1,
  max: 1,
  idleTimeoutMs: 0, // never evict
  acquireTimeoutMs: 30_000,
} as const;

/** Default pool config when `pool` is supplied without all knobs. */
const MULTI_CONNECTION_DEFAULTS = {
  min: 0,
  max: 10,
  idleTimeoutMs: 180_000, // 3 minutes
  acquireTimeoutMs: 30_000,
} as const;

/** Resolved, engine-agnostic sizing knobs derived from an `EnginePoolOptions`. */
export type ResolvedPoolConfig = {
  min: number;
  max: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
};

/** A queued acquirer waiting for a connection to become available. */
export type Waiter<T> = {
  resolve: (resource: T) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  /**
   * `true` once either the timeout or `release` has handled this
   * waiter. The other side checks this and bails — prevents the
   * `__waiters.splice` and the stray (idempotent but noisy) `reject()`
   * when both fire on the same tick.
   */
  settled: boolean;
};

/**
 * Construction hooks for a {@link ConnectionPool}. The four resource
 * operations are bound references to the owning engine's abstract
 * `_createResource` / `_destroyResource` / `_validateResource` / `_ping`;
 * `onWarn` lets the pool surface warnings through the engine's event
 * system; `instanceId` is a lazy accessor (the engine's `Engine::Name`
 * identity isn't known until after `super()` returns, so it must be read
 * on demand, not captured at construction) used only for error context.
 *
 * @template T - The underlying connection resource type.
 */
export type ConnectionPoolOptions<T> = ResolvedPoolConfig & {
  /** Lazily resolve the owning engine's `Engine::Name` id for error context. */
  instanceId: () => string;
  /** Construct one new resource. */
  create: () => Promise<T> | T;
  /** Dispose of a resource. */
  destroy: (resource: T) => Promise<void> | void;
  /** Validate a resource before it is handed back out. */
  validate: (resource: T) => Promise<boolean> | boolean;
  /** Engine-specific liveness check on a resource. */
  ping: (resource: T) => Promise<boolean> | boolean;
  /** Surface a warning message (pool saturation, re-warm failure, etc.). */
  onWarn: (message: string) => void;
};

/**
 * Composable connection pool. Instantiated by an engine (typically
 * `BaseEngine`) which delegates its connection-acquisition seams here.
 *
 * @template T - The underlying connection resource type (e.g. `TcpConn`, a
 *   driver-specific client object).
 */
export class ConnectionPool<T> {
  //#region Pool state

  /** Idle (not currently checked out) resources. */
  private __idle: T[] = [];

  /** Resources handed out to callers, awaiting `release`. */
  private __active: Set<T> = new Set();

  /** Acquirers parked because the pool is at `max` capacity. */
  private __waiters: Waiter<T>[] = [];

  /** Idle-eviction timers, keyed by the resource they govern. */
  private __idleTimers: Map<T, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Number of factory calls currently in flight. Counted toward pool size
   * so concurrent acquires don't all decide to spawn fresh resources past
   * `max` while their factories are awaiting.
   */
  private __pending = 0;

  /**
   * Resources released into the waiter hand-off and currently being
   * validated by {@link __handToWaiter}. They belong to neither `__idle`
   * nor `__active` for the duration of that `await`, so they are parked
   * here and counted toward pool size — otherwise every capacity check
   * undercounts and a concurrent `acquire` spawns a resource past `max`.
   */
  private __handoff: Set<T> = new Set();

  /** True once `drain` has begun; suppresses new acquires. */
  private __draining = false;

  //#endregion Pool state

  //#region Config

  private readonly __min: number;
  private readonly __max: number;
  private readonly __idleTimeoutMs: number;
  private readonly __acquireTimeoutMs: number;
  private readonly __instanceId: () => string;
  private readonly __create: () => Promise<T> | T;
  private readonly __destroy: (resource: T) => Promise<void> | void;
  private readonly __validate: (resource: T) => Promise<boolean> | boolean;
  private readonly __ping: (resource: T) => Promise<boolean> | boolean;
  private readonly __onWarn: (message: string) => void;

  //#endregion Config

  constructor(options: ConnectionPoolOptions<T>) {
    this.__min = options.min;
    this.__max = options.max;
    this.__idleTimeoutMs = options.idleTimeoutMs;
    this.__acquireTimeoutMs = options.acquireTimeoutMs;
    this.__instanceId = options.instanceId;
    this.__create = options.create;
    this.__destroy = options.destroy;
    this.__validate = options.validate;
    this.__ping = options.ping;
    this.__onWarn = options.onWarn;
  }

  /**
   * Resolve a user-supplied `pool` option into engine-agnostic sizing knobs.
   * No `pool` configured → single-connection (min:1, max:1, no eviction);
   * configured → fill in any unspecified knob from the multi-connection
   * defaults.
   */
  static resolveOptions(
    opt: EnginePoolOptions | undefined,
  ): ResolvedPoolConfig {
    return opt === undefined ? { ...SINGLE_CONNECTION_POOL } : {
      min: opt.min ?? MULTI_CONNECTION_DEFAULTS.min,
      max: opt.max ?? MULTI_CONNECTION_DEFAULTS.max,
      idleTimeoutMs: (opt.idleTimeoutSeconds ?? 180) * 1000,
      acquireTimeoutMs: (opt.acquireTimeoutSeconds ?? 30) * 1000,
    };
  }

  //#region Introspection (used by the owning engine)

  /** Whether the pool is draining. Set by the engine on disconnect / reconnect. */
  public get draining(): boolean {
    return this.__draining;
  }
  public set draining(value: boolean) {
    this.__draining = value;
  }

  /** Live idle-resource list (by reference). */
  public get idle(): T[] {
    return this.__idle;
  }

  /** Live waiter queue (by reference). */
  public get waiters(): Waiter<T>[] {
    return this.__waiters;
  }

  /** Number of factory calls currently in flight. */
  public get pending(): number {
    return this.__pending;
  }

  /**
   * Current pool size — every resource this pool owns, whichever bucket
   * it is sitting in: idle, checked out, mid-factory (`__pending`), or
   * mid-hand-off (`__handoff`). The single expression every capacity check
   * uses, so a resource can never be transiently invisible to one of them
   * (which is how the pool used to exceed `max`).
   */
  public size(): number {
    return this.__idle.length + this.__active.size + this.__pending +
      this.__handoff.size;
  }

  /** Snapshot of pool statistics. */
  public stats(): EnginePoolStats {
    return {
      total: this.size(),
      active: this.__active.size,
      idle: this.__idle.length,
      waiting: this.__waiters.length,
    };
  }

  /**
   * Liveness check. Acquires a resource, runs the engine-specific ping, and
   * releases it. Returns `false` (rather than throwing) if the acquire or
   * the ping itself fails — callers can poll without try/catch ceremony.
   */
  public async ping(): Promise<boolean> {
    let resource: T | undefined;
    try {
      resource = await this.acquire();
      return await this.__ping(resource);
    } catch {
      return false;
    } finally {
      if (resource !== undefined) {
        this.release(resource);
      }
    }
  }

  //#endregion Introspection

  //#region Connection acquisition

  /**
   * Acquire one connection. Returns an existing idle one if available,
   * creates a new one if below `max`, or queues until one frees up.
   *
   * Callers MUST call `release` (or `destroy`) exactly once per acquired
   * resource, ideally in a `try/finally`.
   *
   * @param timeoutMs - Override the default acquire timeout for this call.
   * @throws {EngineError} `POOL_DRAINING` if the pool is draining.
   * @throws {EngineError} `POOL_ACQUIRE_TIMEOUT` if the timeout elapses while
   *   queued; or whatever the factory throws when creating a new resource.
   */
  public async acquire(timeoutMs?: number): Promise<T> {
    if (this.__draining) {
      throw new EngineError('POOL_DRAINING', {
        instanceId: this.__instanceId(),
      });
    }

    // Reuse an idle resource if any is healthy. Claim into `__active`
    // BEFORE the validate await — `await` yields a microtask even when
    // the validator is sync, and a concurrent acquire would otherwise
    // see (idle=[], active.size=0) and spawn a fresh factory call,
    // blowing past `max`.
    while (this.__idle.length > 0) {
      const resource = this.__idle.shift()!;
      this.__clearIdleTimer(resource);
      this.__active.add(resource);
      if (await this.__validate(resource)) {
        return resource;
      }
      // Validation failed — un-claim, destroy, try the next idle.
      this.__active.delete(resource);
      try {
        await this.__destroy(resource);
      } catch {
        /* ignore destroy errors — resource is gone either way */
      }
    }

    // Create a new resource if we're under max. `__pending` / `__handoff` keep
    // concurrent acquires from all blowing past `max` while a factory or a
    // hand-off validation is awaiting.
    if (this.size() < this.__max) {
      this.__pending++;
      let resource: T;
      try {
        resource = await this.__create();
      } finally {
        this.__pending--;
      }
      this.__active.add(resource);
      return resource;
    }

    // Otherwise queue.
    return await new Promise<T>((resolve, reject) => {
      const timeout = timeoutMs ?? this.__acquireTimeoutMs;
      const waiter: Waiter<T> = {
        resolve,
        reject,
        timer: null,
        settled: false,
      };
      if (timeout > 0) {
        waiter.timer = setTimeout(() => {
          if (waiter.settled) return;
          waiter.settled = true;
          const idx = this.__waiters.indexOf(waiter);
          if (idx >= 0) this.__waiters.splice(idx, 1);
          // Pool saturation surfaced as a warning: an acquirer waited
          // the full timeout without a connection freeing up.
          this.__onWarn(
            `connection pool exhausted: acquire timed out after ` +
              `${timeout}ms (max=${this.__max}, ` +
              `waiting=${this.__waiters.length})`,
          );
          reject(
            new EngineError('POOL_ACQUIRE_TIMEOUT', {
              instanceId: this.__instanceId(),
              timeoutMs: timeout,
            }),
          );
        }, timeout);
      }
      this.__waiters.push(waiter);
    });
  }

  /**
   * Return a resource to the pool. If a queued acquirer is waiting, the
   * resource is validated and then handed to it. Otherwise it goes back to
   * the idle list with an idle-eviction timer (unless that would drop pool
   * size below `min` or eviction is disabled).
   *
   * Calling `release` with a resource not owned by this pool is a no-op.
   */
  public release(resource: T): void {
    if (!this.__active.has(resource)) return;
    this.__active.delete(resource);

    if (this.__draining) {
      // Don't keep resources around while draining.
      void this.__safeDestroyResource(resource);
      return;
    }

    // No one is waiting: return to idle. The idle list is validated on the
    // next `acquire`, so a resource that died while checked out is caught
    // there before it can be reused.
    if (!this.__hasLiveWaiter()) {
      this.__idle.push(resource);
      this.__scheduleIdleTimer(resource);
      return;
    }

    // A waiter is queued (pool is saturated). Unlike the idle path, a direct
    // hand-off would skip validation entirely — delivering a connection that
    // died while it was checked out (server-side close, transport reset) and
    // failing the waiter for no reason. Validate first, asynchronously
    // (`validate` may probe the socket), and only then hand it over;
    // a dead resource is destroyed and the waiter gets a fresh one instead.
    //
    // Claim it into `__handoff` synchronously, BEFORE the (async) hand-off
    // starts: it has already left `__active`, so without this claim it would
    // be counted nowhere for the duration of the validation await, and a
    // concurrent `acquire` would read the pool as having a free slot and
    // create a resource past `max`. Same hazard `acquire` guards against
    // on its own side (see the comment above its idle loop).
    this.__handoff.add(resource);
    void this.__handToWaiter(resource);
  }

  /**
   * Validate a freed resource, then hand it to the first live waiter — or,
   * if it no longer validates, destroy it (which backfills the waiter with a
   * fresh resource via {@link __pumpWaiters}). Invoked by {@link release}
   * only when a waiter is queued, which claims the resource into
   * {@link __handoff} first; every exit path here drops that claim.
   */
  private async __handToWaiter(resource: T): Promise<void> {
    let valid = false;
    try {
      valid = await this.__validate(resource);
    } catch {
      valid = false;
    }

    if (this.__draining) {
      this.__handoff.delete(resource);
      await this.__safeDestroyResource(resource);
      return;
    }

    if (valid) {
      // Hand off to a live waiter; if every waiter timed out while we were
      // validating, fall back to idle. Both re-home the resource
      // synchronously, so drop the hand-off claim first to avoid
      // double-counting it.
      this.__handoff.delete(resource);
      if (!this.__resolveWaiter(resource)) {
        this.__idle.push(resource);
        this.__scheduleIdleTimer(resource);
      }
      return;
    }

    // Dead resource — destroy it. `destroy` frees a pool slot and pumps a
    // fresh resource to any queued waiter, so the claim has to be released
    // first or the pump would still see the pool as full.
    this.__handoff.delete(resource);
    await this.destroy(resource);
  }

  /**
   * Forcefully remove and destroy a resource (e.g. after a transport
   * error). Use this instead of `release` when the resource cannot be reused.
   *
   * Destroying frees a pool slot, so any queued waiter is backfilled with a
   * freshly created resource rather than being left to time out.
   */
  public async destroy(resource: T): Promise<void> {
    this.__active.delete(resource);
    this.__handoff.delete(resource);
    const idx = this.__idle.indexOf(resource);
    if (idx >= 0) this.__idle.splice(idx, 1);
    this.__clearIdleTimer(resource);
    await this.__safeDestroyResource(resource);
    this.__pumpWaiters();
  }

  /** True if any queued waiter is still live (not already settled). */
  private __hasLiveWaiter(): boolean {
    for (const waiter of this.__waiters) {
      if (!waiter.settled) return true;
    }
    return false;
  }

  /**
   * Hand `resource` to the first live waiter, skipping settled ones.
   * Returns `true` if a waiter received it, `false` if none were live.
   */
  private __resolveWaiter(resource: T): boolean {
    while (this.__waiters.length > 0) {
      const waiter = this.__waiters.shift()!;
      if (waiter.settled) continue;
      waiter.settled = true;
      if (waiter.timer) clearTimeout(waiter.timer);
      this.__active.add(resource);
      waiter.resolve(resource);
      return true;
    }
    return false;
  }

  /** Pop and settle the first live waiter (without giving it a resource). */
  private __shiftLiveWaiter(): Waiter<T> | undefined {
    while (this.__waiters.length > 0) {
      const waiter = this.__waiters.shift()!;
      if (waiter.settled) continue;
      waiter.settled = true;
      if (waiter.timer) clearTimeout(waiter.timer);
      return waiter;
    }
    return undefined;
  }

  /**
   * Backfill queued waiters after capacity frees up (e.g. a resource was
   * destroyed). Creates one fresh resource per live waiter, up to `max`.
   * Fire-and-forget: each creation resolves (or rejects) its waiter.
   */
  private __pumpWaiters(): void {
    if (this.__draining) return;
    let live = 0;
    for (const waiter of this.__waiters) {
      if (!waiter.settled) live++;
    }
    while (live > 0 && this.size() < this.__max) {
      live--;
      void this.__createForWaiter();
    }
  }

  /** Create one resource for a queued waiter (used by {@link __pumpWaiters}). */
  private async __createForWaiter(): Promise<void> {
    this.__pending++;
    let resource: T;
    try {
      resource = await this.__create();
    } catch (e) {
      // Surface the creation failure to the next live waiter rather than
      // leaving it to time out.
      const waiter = this.__shiftLiveWaiter();
      if (waiter) {
        waiter.reject(
          e instanceof EngineError ? e : new EngineError(
            'CONNECTION_FAILED',
            { instanceId: this.__instanceId() },
            e as Error,
          ),
        );
      }
      return;
    } finally {
      this.__pending--;
    }
    if (this.__draining) {
      await this.__safeDestroyResource(resource);
      return;
    }
    if (!this.__resolveWaiter(resource)) {
      this.__idle.push(resource);
      this.__scheduleIdleTimer(resource);
    }
  }

  //#endregion Connection acquisition

  //#region Pool internals

  /** Pre-create `min` resources so the pool is warm. */
  public async ensureMin(): Promise<void> {
    if (this.__min <= 0) return;
    const need = this.__min - this.size();
    if (need <= 0) return;
    const promises: Promise<void>[] = [];
    for (let i = 0; i < need; i++) {
      promises.push(this.__createWarm());
    }
    await Promise.all(promises);
  }

  private async __createWarm(): Promise<void> {
    if (this.__draining) return;
    this.__pending++;
    let resource: T;
    try {
      resource = await this.__create();
    } finally {
      this.__pending--;
    }
    // The factory `await` above yields; a `drain()` can have emptied the
    // pool in the meantime (the timer-driven `ensureMin` re-warm fires this
    // during normal READY operation, so the window is reachable). `drain`
    // snapshots and destroys `__idle` exactly once, so a live connection pushed
    // in afterwards is never cleaned up — an orphaned socket and a dangling
    // server session. Destroy it instead of stranding it in a drained pool.
    if (this.__draining) {
      await this.__safeDestroyResource(resource);
      return;
    }
    this.__idle.push(resource);
    this.__scheduleIdleTimer(resource);
  }

  /**
   * Stop accepting new acquires, reject pending waiters, and destroy all
   * idle resources. Active resources are destroyed when their owners
   * release them.
   */
  public async drain(): Promise<void> {
    if (this.__draining) return;
    this.__draining = true;

    while (this.__waiters.length > 0) {
      const waiter = this.__waiters.shift()!;
      if (waiter.settled) continue;
      waiter.settled = true;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(
        new EngineError('POOL_DRAINING', {
          instanceId: this.__instanceId(),
        }),
      );
    }

    const toDestroy = this.__idle.splice(0);
    for (const resource of toDestroy) {
      this.__clearIdleTimer(resource);
      await this.__safeDestroyResource(resource);
    }
  }

  private __scheduleIdleTimer(resource: T): void {
    if (this.__idleTimeoutMs <= 0) return;
    // Don't evict below min. This is only the *scheduling* decision — the
    // same invariant is re-checked when the timer fires, see
    // `__onIdleTimeout`.
    if (this.__idle.length + this.__active.size <= this.__min) return;
    const timer = setTimeout(
      () => this.__onIdleTimeout(resource),
      this.__idleTimeoutMs,
    );
    this.__idleTimers.set(resource, timer);
  }

  /**
   * Idle-eviction timer for `resource` fired: drop it, unless doing so would
   * take the pool below `min`.
   *
   * The invariant has to be re-tested here rather than trusted from schedule
   * time. Every release that leaves the pool above `min` arms a timer, so a
   * pool that was briefly busy ends up holding one timer per idle resource,
   * each armed on a snapshot that was true when it was taken. Acting on that
   * stale snapshot drains a `min > 0` pool to zero — with `min: 2`, three
   * connections released one at a time all arm timers, and all three then
   * evict themselves. Nothing re-warms afterwards (`ensureMin` only runs
   * from `connect`, which is a no-op while the status is READY).
   */
  private __onIdleTimeout(resource: T): void {
    this.__idleTimers.delete(resource);
    const idx = this.__idle.indexOf(resource);
    // Already acquired or destroyed — nothing to evict.
    if (idx < 0) return;

    const size = this.__idle.length + this.__active.size;
    if (size > this.__min) {
      this.__idle.splice(idx, 1);
      void this.__safeDestroyResource(resource);
      return;
    }

    // At `min`: keep this one warm. If we're *under* min — a resource was
    // destroyed out from under the pool by `destroy` (transport error) —
    // top it back up so the documented floor holds.
    if (size < this.__min && !this.__draining) {
      void this.ensureMin().catch((e) => {
        // Non-fatal: `acquire` still creates on demand. Surface it as a
        // warning rather than an unhandled rejection.
        this.__onWarn(
          `failed to re-warm pool to min=${this.__min}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });
    }
  }

  private __clearIdleTimer(resource: T): void {
    const timer = this.__idleTimers.get(resource);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.__idleTimers.delete(resource);
    }
  }

  /** Destroy a resource, swallowing errors (the resource is gone either way). */
  private async __safeDestroyResource(resource: T): Promise<void> {
    try {
      await this.__destroy(resource);
    } catch {
      /* ignore */
    }
  }

  //#endregion Pool internals
}

//#region Local validators

/**
 * Construction-time shape check for the `pool` option. Verifies field
 * types and the `min ≤ max` / `max ≥ 1` invariants; called by the engine's
 * option processing.
 */
export function validatePoolOptions(
  value: unknown,
): value is EnginePoolOptions {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const pool = value as Record<string, unknown>;
  const nonNegativeInt = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (pool.min !== undefined && !nonNegativeInt(pool.min)) return false;
  if (pool.max !== undefined && !nonNegativeInt(pool.max)) return false;
  // `max: 0` would deadlock: `acquire` never creates a resource and
  // waiters queue forever. Require at least one slot when the pool is
  // explicitly configured.
  if (pool.max !== undefined && (pool.max as number) < 1) return false;
  // Enforce `min ≤ max` against the *effective* max the pool will actually
  // run with. When `max` is omitted, `resolveOptions` fills it from
  // `MULTI_CONNECTION_DEFAULTS.max` (a configured `pool` object never falls
  // back to the single-connection defaults), so a lone `{ min: 20 }` would
  // otherwise pass this guard yet resolve to `{ min: 20, max: 10 }` — a pool
  // pinned at 2× its declared ceiling that idle-eviction can never prune back
  // down. Compare against that default so the contradiction surfaces as
  // INVALID_CONFIG_VALUE at config time rather than silently over-provisioning.
  if (typeof pool.min === 'number') {
    const effectiveMax = pool.max !== undefined
      ? (pool.max as number)
      : MULTI_CONNECTION_DEFAULTS.max;
    if (pool.min > effectiveMax) return false;
  }
  if (
    pool.idleTimeoutSeconds !== undefined &&
    !nonNegativeInt(pool.idleTimeoutSeconds)
  ) {
    return false;
  }
  if (
    pool.acquireTimeoutSeconds !== undefined &&
    !nonNegativeInt(pool.acquireTimeoutSeconds)
  ) {
    return false;
  }
  return true;
}

//#endregion Local validators

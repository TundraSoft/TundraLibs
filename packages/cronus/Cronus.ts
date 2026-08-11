/**
 * @fileoverview {@link Cronus} — a cross-runtime, minute-resolution cron
 * scheduler. Tick-and-match architecture: a self-correcting timer fires
 * at each minute boundary and runs every job whose schedule matches the
 * current time. It never computes a "next run", so an impossible
 * expression (`0 0 30 2 *`) simply never fires rather than crashing, and
 * there is no far-future timer to overflow.
 *
 * Like classic cron, minutes that pass while the process is blocked,
 * suspended, or stopped are NOT replayed — there is no catch-up.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { Cronus } from '@tundralibs/cronus';
 *
 * const cron = new Cronus();
 * cron.on('error', (_id, name, _at, _ms, err) =>
 *   console.error(`job ${name} failed:`, err.message));
 *
 * cron.add('cleanup', '0 * * * *', async () => {
 *   await purgeExpired();
 * });
 *
 * cron.start();
 * ```
 */

import { type EventCallback, Events } from '@tundralibs/utils';
import {
  CronusError,
  DuplicateJobError,
  InvalidActionError,
  JobNotFoundError,
} from './errors/mod.ts';
import { isValidSchedule, matches, parseSchedule } from './schedule.ts';
import type {
  CronusAction,
  CronusEvents,
  CronusJobInfo,
  CronusJobOptions,
  CronusOptions,
  ParsedSchedule,
} from './types/mod.ts';

const MINUTE_MS = 60_000;

/**
 * A wall-clock step backwards of at most this many minutes is treated
 * as jitter and deduplicated; a larger step is a clock CHANGE — the
 * ticker resynchronises to the new time (without replaying anything).
 */
const CLOCK_JITTER_MINUTES = 2;

/**
 * A cross-runtime timer handle (Deno returns numbers; Node and Bun
 * return Timeout objects).
 */
type TimerHandle = number | { unref?: () => void };

/** A registered job — the scheduler's internal mutable record. */
type CronusJob = {
  name: string;
  schedule: string;
  action: CronusAction;
  once: boolean;
  enabled: boolean;
  /** Guards against concurrent runs of the same job (overlap prevention). */
  running: boolean;
  runCount: number;
  lastRun: Date | null;
};

/** `unref` a timer where the runtime supports it (no-op elsewhere). */
function unrefTimer(handle: TimerHandle): void {
  if (typeof handle === 'number') {
    (globalThis as { Deno?: { unrefTimer?: (id: number) => void } })
      .Deno?.unrefTimer?.(handle);
  } else {
    handle.unref?.();
  }
}

/**
 * The scheduler. Register jobs with {@link Cronus.add}, then
 * {@link Cronus.start}. Concurrency-safe per job: while a job's action
 * is running, matching ticks are SKIPPED — a job scheduled every minute
 * that takes five minutes to run resumes on the sixth minute, never
 * overlapping itself. (The guard is per registration: removing and
 * re-adding a name while its old run is still in flight starts a fresh
 * guard. It also assumes actions SETTLE — an action that never resolves
 * wedges its job until `remove()` + `add()`.)
 *
 * Listeners are isolated: each listener is wrapped at registration, so
 * one that throws synchronously OR rejects asynchronously is caught and
 * reported via `console.error` — it never affects the run, other
 * listeners, the ticker, or the process.
 */
export class Cronus extends Events<CronusEvents> {
  private readonly __jobs: Map<string, CronusJob> = new Map();
  private readonly __parsed: Map<string, ParsedSchedule> = new Map();
  /** Original listener → isolation wrapper (lets `off(original)` work). */
  private readonly __wrapped: WeakMap<EventCallback, EventCallback> =
    new WeakMap();
  private readonly __unref: boolean;
  private __timer: TimerHandle | undefined;
  private __active = false;
  /** Invalidates in-flight timer chains on stop()/start(). */
  private __generation = 0;
  /** Last epoch-minute evaluated — guards against double evaluation. */
  private __lastTickMinute = -1;

  constructor(options: CronusOptions = {}) {
    super();
    this.__unref = options.unref ?? false;
  }

  /**
   * Register a listener. The callback is wrapped for isolation: a sync
   * throw or async rejection is caught and reported via
   * `console.error`, never propagated.
   */
  public override on<K extends keyof CronusEvents>(
    event: K,
    callback: CronusEvents[K],
  ): this;
  public override on<K extends keyof CronusEvents>(
    event: K,
    callback: CronusEvents[K][],
  ): this;
  public override on(
    event: string,
    callback: EventCallback | EventCallback[],
  ): this {
    if (Array.isArray(callback)) {
      for (const cb of callback) this.on(event as never, cb as never);
      return this;
    }
    return super.on(event as never, this.__isolate(callback) as never);
  }

  /**
   * Remove listener(s). Accepts the ORIGINAL callback passed to
   * `on`/`once` (the isolation wrapper is resolved internally).
   */
  public override off<K extends keyof CronusEvents>(
    event: K,
    callback?: CronusEvents[K],
  ): this;
  public override off<K extends keyof CronusEvents>(
    event: K,
    callback?: CronusEvents[K][],
  ): this;
  public override off(
    event: string,
    callback?: EventCallback | EventCallback[],
  ): this {
    if (callback === undefined) return super.off(event as never);
    if (Array.isArray(callback)) {
      for (const cb of callback) this.off(event as never, cb as never);
      return this;
    }
    return super.off(
      event as never,
      (this.__wrapped.get(callback) ?? callback) as never,
    );
  }

  /**
   * Register a one-shot listener (isolated like {@link Cronus.on});
   * removable via `off(event, originalCallback)` before it fires.
   */
  public override once<K extends keyof CronusEvents>(
    event: K,
    callback: CronusEvents[K],
  ): this;
  public override once<K extends keyof CronusEvents>(
    event: K,
    callback: CronusEvents[K][],
  ): this;
  public override once(
    event: string,
    callback: EventCallback | EventCallback[],
  ): this {
    if (Array.isArray(callback)) {
      for (const cb of callback) this.once(event as never, cb as never);
      return this;
    }
    const isolated = this.__isolate(callback);
    const wrapper: EventCallback = (...args: unknown[]) => {
      super.off(event as never, wrapper as never);
      return isolated(...args);
    };
    this.__wrapped.set(callback, wrapper);
    return super.on(event as never, wrapper as never);
  }

  /** `true` while the ticker is running. */
  public get active(): boolean {
    return this.__active;
  }

  /** Number of registered jobs. */
  public get size(): number {
    return this.__jobs.size;
  }

  /**
   * Register a job.
   *
   * @param name - Unique job name.
   * @param schedule - A 5-field cron expression.
   * @param action - Sync or async {@link CronusAction} to run on each
   *   match. Actions must settle — a never-resolving action wedges its
   *   job (overlap guard) until `remove()` + `add()`.
   * @param options - See {@link CronusJobOptions}.
   * @throws {DuplicateJobError} When `name` is already registered.
   * @throws {InvalidScheduleError} When `schedule` is malformed.
   * @throws {InvalidActionError} When `action` is not a function.
   */
  public add(
    name: string,
    schedule: string,
    action: CronusAction,
    options: CronusJobOptions = {},
  ): this {
    if (this.__jobs.has(name)) {
      throw new DuplicateJobError(
        `A job named '${name}' is already registered`,
        { name },
      );
    }
    if (typeof action !== 'function') {
      throw new InvalidActionError(`Job '${name}' action must be a function`, {
        name,
      });
    }
    // Parse now — a bad schedule fails at registration, never silently.
    this.__parsed.set(name, parseSchedule(schedule));
    this.__jobs.set(name, {
      name,
      schedule,
      action,
      once: options.once ?? false,
      enabled: options.enabled ?? true,
      running: false,
      runCount: 0,
      lastRun: null,
    });
    return this;
  }

  /**
   * Register a job that runs ONCE at its next matching minute, then
   * auto-removes. Convenience for `add(..., { once: true })`.
   *
   * @throws {DuplicateJobError} When `name` is already registered.
   * @throws {InvalidScheduleError} When `schedule` is malformed.
   * @throws {InvalidActionError} When `action` is not a function.
   */
  public addOnce(name: string, schedule: string, action: CronusAction): this {
    return this.add(name, schedule, action, { once: true });
  }

  /**
   * Remove a job. A run already in flight is not interrupted — and its
   * completion cannot touch a job registered later under the same name.
   *
   * @throws {JobNotFoundError} When `name` is not registered.
   */
  public remove(name: string): this {
    if (!this.__jobs.has(name)) {
      throw new JobNotFoundError(`No job registered under '${name}'`, {
        name,
      });
    }
    this.__jobs.delete(name);
    this.__parsed.delete(name);
    return this;
  }

  /** Whether a job is registered. */
  public has(name: string): boolean {
    return this.__jobs.has(name);
  }

  /**
   * Read a job's public state as a {@link CronusJobInfo} snapshot
   * (mutating the snapshot never affects the scheduler).
   *
   * @throws {JobNotFoundError} When `name` is not registered.
   */
  public get(name: string): CronusJobInfo {
    return this.__info(this.__mustGet(name));
  }

  /** All jobs' public state (snapshots — see {@link Cronus.get}). */
  public list(): CronusJobInfo[] {
    return [...this.__jobs.values()].map((job) => this.__info(job));
  }

  /**
   * Enable a disabled job.
   *
   * @throws {JobNotFoundError} When `name` is not registered.
   */
  public enable(name: string): this {
    this.__mustGet(name).enabled = true;
    return this;
  }

  /**
   * Disable a job (skipped by the ticker; still runnable via
   * {@link Cronus.trigger}).
   *
   * @throws {JobNotFoundError} When `name` is not registered.
   */
  public disable(name: string): this {
    this.__mustGet(name).enabled = false;
    return this;
  }

  /**
   * Whether a job's action is currently running. (The flag stays `true`
   * through that run's `success`/`error`/`finish` emissions.)
   *
   * @throws {JobNotFoundError} When `name` is not registered.
   */
  public isRunning(name: string): boolean {
    return this.__mustGet(name).running;
  }

  /**
   * Start the ticker. Aligns to the next minute boundary, then fires at
   * each `:00`, self-correcting the phase against timer drift.
   * Idempotent. A job is never fired for the minute in which `start()`
   * is called, and minutes missed while stopped/blocked/suspended are
   * not replayed — standard cron behaviour.
   */
  public start(): this {
    if (this.__active) return this;
    this.__active = true;
    this.__generation += 1;
    this.__scheduleTick(this.__generation);
    return this;
  }

  /**
   * Stop the ticker. Registrations survive; `start()` resumes. A run
   * already in flight completes (it is not cancelled).
   */
  public stop(): this {
    this.__active = false;
    // Invalidate any timer chain that has already fired but not yet
    // re-armed — otherwise a stop()+start() from inside a tick would
    // leave two chains running.
    this.__generation += 1;
    if (this.__timer !== undefined) {
      clearTimeout(this.__timer as number);
      this.__timer = undefined;
    }
    return this;
  }

  /**
   * Run a job NOW, bypassing its schedule. Respects the overlap guard:
   * if the job is already running (including from inside that run's own
   * event listeners), this is a no-op and resolves `false`. Otherwise
   * it runs (awaited — a never-settling action hangs this await) and
   * resolves `true`; the run itself never rejects — subscribe to
   * `error` for failures. Works whether or not the ticker is started,
   * and on disabled jobs.
   *
   * @throws {JobNotFoundError} When `name` is not registered.
   */
  public async trigger(name: string): Promise<boolean> {
    const job = this.__mustGet(name);
    if (job.running) return false;
    await this.__run(job, new Date(), true);
    return true;
  }

  /** Validate a cron expression without throwing (syntactic only). */
  public static isValid(schedule: string): boolean {
    return isValidSchedule(schedule);
  }

  /**
   * Would `schedule` fire at `at` (default: now)?
   *
   * @throws {InvalidScheduleError} When `schedule` is malformed.
   */
  public static matches(schedule: string, at: Date = new Date()): boolean {
    return matches(parseSchedule(schedule), at);
  }

  /**
   * Evaluate one tick at `at`: run every enabled, non-running job whose
   * schedule matches that minute. Each epoch minute is evaluated at
   * most once; a small wall-clock step backwards (≤ 2 minutes — timer
   * jitter, NTP nudge) is deduplicated, while a larger one is treated
   * as a clock CHANGE and resynchronises the watermark (nothing is
   * replayed). Jobs registered while a tick is being evaluated are not
   * fired by that same tick.
   *
   * The built-in ticker calls this at each minute boundary; subclasses
   * driving ticks from an external clock may call it directly.
   */
  protected _tick(at: Date): void {
    const minute = Math.floor(at.getTime() / MINUTE_MS);
    if (minute === this.__lastTickMinute) return;
    if (
      minute < this.__lastTickMinute &&
      this.__lastTickMinute - minute <= CLOCK_JITTER_MINUTES
    ) {
      return;
    }
    this.__lastTickMinute = minute;
    // Snapshot: registrations made DURING this tick wait for the next
    // minute (a live Map iteration would run them immediately — and a
    // self-re-registering job could loop forever inside one tick).
    for (const job of [...this.__jobs.values()]) {
      if (this.__jobs.get(job.name) !== job) continue; // removed mid-tick
      if (!job.enabled) continue;
      const parsed = this.__parsed.get(job.name);
      if (parsed === undefined || !matches(parsed, at)) continue;
      if (job.running) {
        // Overlap prevented — the previous run has not finished.
        this.__emit('skip', job.name, new Date(at.getTime()));
        continue;
      }
      // Every job gets its OWN Date — an action or listener mutating
      // its scheduledAt cannot corrupt sibling matching or timestamps.
      void this.__run(job, new Date(at.getTime()), false);
    }
  }

  /**
   * Wrap a listener so a sync throw or async rejection is caught and
   * reported, never propagated. Cached per original callback so
   * registration dedupe and `off(original)` keep working.
   */
  private __isolate(callback: EventCallback): EventCallback {
    let wrapped = this.__wrapped.get(callback);
    if (wrapped === undefined) {
      wrapped = (...args: unknown[]) => {
        try {
          const out = callback(...args) as unknown;
          if (out instanceof Promise) {
            out.catch((error) =>
              console.error('[cronus] async listener rejected:', error)
            );
          }
        } catch (error) {
          console.error('[cronus] listener threw:', error);
        }
      };
      this.__wrapped.set(callback, wrapped);
    }
    return wrapped;
  }

  /**
   * Emit defensively. Listeners registered through {@link Cronus.on}/
   * {@link Cronus.once} are individually isolated already; this is the
   * outer belt for anything that reached the base class directly.
   */
  private __emit<K extends keyof CronusEvents>(
    event: K,
    ...args: Parameters<CronusEvents[K]>
  ): void {
    try {
      this.emit(event, ...args);
    } catch (error) {
      console.error(`[cronus] '${String(event)}' listener threw:`, error);
    }
  }

  /** Snapshot a {@link CronusJob} onto its public read-only view. */
  private __info(job: CronusJob): CronusJobInfo {
    return {
      name: job.name,
      schedule: job.schedule,
      once: job.once,
      enabled: job.enabled,
      running: job.running,
      runCount: job.runCount,
      lastRun: job.lastRun === null ? null : new Date(job.lastRun.getTime()),
    };
  }

  /**
   * Fetch a job or throw.
   *
   * @throws {JobNotFoundError} When `name` is not registered.
   */
  private __mustGet(name: string): CronusJob {
    const job = this.__jobs.get(name);
    if (job === undefined) {
      throw new JobNotFoundError(`No job registered under '${name}'`, {
        name,
      });
    }
    return job;
  }

  /**
   * Self-correcting: arm the next tick at the next minute boundary.
   * The `generation` token kills stale chains — a chain only re-arms
   * while its generation is current.
   */
  private __scheduleTick(generation: number): void {
    if (!this.__active || generation !== this.__generation) return;
    const msToNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS);
    const timer = setTimeout(() => {
      if (generation !== this.__generation) return; // stale chain — die
      this._tick(new Date());
      this.__scheduleTick(generation);
    }, msToNextMinute);
    if (this.__unref) unrefTimer(timer);
    this.__timer = timer;
  }

  /**
   * Run a job's action once with the full event lifecycle. Nothing in
   * here can throw or reject: action errors are normalised and routed
   * to the `error` event, listener errors are isolated. The overlap
   * guard (`running`) is held through the emissions and once-cleanup
   * happens last, so a listener re-triggering the job re-enters the
   * guard instead of recursing.
   */
  private async __run(
    job: CronusJob,
    scheduledAt: Date,
    triggered: boolean,
  ): Promise<void> {
    job.running = true;
    job.runCount += 1;
    job.lastRun = new Date();
    const runId = crypto.randomUUID();
    const started = Date.now();
    this.__emit('run', runId, job.name, scheduledAt);
    let result: unknown;
    let failure: CronusError | undefined;
    try {
      result = await job.action({
        runId,
        name: job.name,
        // The action's own copy — mutating it cannot skew event
        // timestamps.
        scheduledAt: new Date(scheduledAt.getTime()),
        runCount: job.runCount,
        triggered,
      });
    } catch (cause) {
      // Errors NEVER escape a run — routed to the `error` event. A job
      // that throws every time can never stop the ticker.
      failure = cause instanceof CronusError ? cause : new CronusError(
        cause instanceof Error ? cause.message : String(cause),
        { job: job.name },
        cause instanceof Error ? cause : undefined,
      );
    }
    const elapsed = Date.now() - started;
    if (failure === undefined) {
      this.__emit('success', runId, job.name, scheduledAt, elapsed, result);
    } else {
      this.__emit('error', runId, job.name, scheduledAt, elapsed, failure);
    }
    this.__emit('finish', runId, job.name, scheduledAt, elapsed);
    // Release the guard LAST: a listener above that re-triggered this
    // job saw running=true and backed off (resolves false).
    job.running = false;
    // One-shot cleanup is identity-checked: a stale run can never
    // delete a job registered later under the same name.
    if (job.once && this.__jobs.get(job.name) === job) {
      this.__jobs.delete(job.name);
      this.__parsed.delete(job.name);
    }
  }
}

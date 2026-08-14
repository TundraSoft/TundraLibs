/**
 * @fileoverview {@link Events} — a tiny typed event emitter with a
 * public `on` / `off` / `once` subscription surface and PROTECTED
 * emission (`_emit` / `_emitSync` / `_emitRaw`): only the owning class
 * fires its events, so outsiders cannot forge lifecycle signals.
 * Listeners are isolated per emission — a throwing or rejecting
 * listener is routed to {@link Events._onListenerError}, never
 * propagated into the emitter or other listeners.
 *
 * @module
 */

/** Sync or async callback registered with {@link Events.on}. */
// deno-lint-ignore no-explicit-any
export type EventCallback = (...args: any[]) => unknown;

/**
 * Typed event emitter. Subclass with an `E` map of event-name to
 * callback signature; the compiler then enforces correct arg types
 * at every `on`/`_emit` site.
 *
 * Emission semantics:
 * - Emission is `protected` — the public surface is subscription only.
 * - Each emission iterates a SNAPSHOT of the listener set: listeners
 *   added during an emission fire from the next emission; listeners
 *   removed during an emission still receive the current one.
 * - Listeners are isolated: a synchronous throw or an asynchronous
 *   rejection (from `_emit`'s fire-and-forget promises) is caught and
 *   routed to {@link Events._onListenerError}; remaining listeners
 *   still run.
 *
 * @typeParam E - Map of event names to callback signatures.
 *
 * @example
 * ```typescript
 * type AppEvents = {
 *   start: () => void;
 *   error: (e: Error) => void;
 * };
 * class App extends Events<AppEvents> {
 *   run() { this._emit('start'); }
 * }
 * ```
 */
export class Events<
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> {
  private readonly __events: Map<keyof E, Set<EventCallback>> = new Map();
  /** Per-event map of original `once` callback → self-removing wrapper. */
  private readonly __onceWrappers: Map<
    keyof E,
    Map<EventCallback, EventCallback>
  > = new Map();

  /**
   * Register `callback` (or each function in an array) for `event`.
   * Duplicate registrations are no-ops.
   */
  public on<K extends keyof E>(event: K, callback: E[K]): this;
  public on<K extends keyof E>(event: K, callback: E[K][]): this;
  public on(event: string, callback: EventCallback | EventCallback[]) {
    if (!this.__events.has(event)) {
      this.__events.set(event, new Set());
    }
    const eventCallbacks = this.__events.get(event);
    if (!eventCallbacks) return this;

    if (Array.isArray(callback)) {
      for (const cb of callback) {
        this.on(event, cb as E[keyof E]);
      }
    } else if (!eventCallbacks.has(callback)) {
      eventCallbacks.add(callback);
    }
    return this;
  }

  /**
   * Remove `callback` from `event` (or every listener for `event`
   * when `callback` is omitted). Accepts the ORIGINAL callback for
   * listeners registered via {@link Events.once} — the internal
   * wrapper is resolved automatically.
   */
  public off<K extends keyof E>(event: K, callback?: E[K]): this;
  public off<K extends keyof E>(event: K, callback?: E[K][]): this;
  public off(event: string, callback?: EventCallback | EventCallback[]) {
    if (!this.__events.has(event)) {
      return this;
    }
    if (callback === undefined) {
      this.__events.delete(event);
      this.__onceWrappers.delete(event);
      return this;
    }
    const eventCallbacks = this.__events.get(event);
    if (!eventCallbacks) return this;

    if (Array.isArray(callback)) {
      for (const cb of callback) {
        this.off(event, cb as E[keyof E]);
      }
      return this;
    }
    const wrappers = this.__onceWrappers.get(event);
    const wrapper = wrappers?.get(callback);
    if (wrapper !== undefined) {
      eventCallbacks.delete(wrapper);
      wrappers!.delete(callback);
    } else {
      eventCallbacks.delete(callback);
    }
    return this;
  }

  /**
   * Like {@link Events.on}, but each listener fires at most once.
   * Duplicate registrations are no-ops (matching `on`), and the
   * listener can be removed before firing with
   * `off(event, originalCallback)`.
   */
  public once<K extends keyof E>(event: K, callback: E[K]): this;
  public once<K extends keyof E>(event: K, callback: E[K][]): this;
  public once(event: string, callback: EventCallback | EventCallback[]) {
    if (Array.isArray(callback)) {
      for (const cb of callback) {
        this.once(event, cb as E[keyof E]);
      }
      return this;
    }
    let wrappers = this.__onceWrappers.get(event);
    if (wrappers?.has(callback)) return this; // dedupe, like on()
    if (wrappers === undefined) {
      wrappers = new Map();
      this.__onceWrappers.set(event, wrappers);
    }
    const wrapper: EventCallback = (...args: unknown[]) => {
      // Self-remove by WRAPPER identity — virtual dispatch, so a
      // subclass that layers its own wrapping in on()/off() (keyed by
      // what IT received, i.e. this wrapper) translates the removal
      // correctly. The original→wrapper mapping is cleaned here so the
      // off(original) support never leaks entries.
      wrappers!.delete(callback);
      this.off(event, wrapper as E[keyof E]);
      return callback(...args);
    };
    wrappers.set(callback, wrapper);
    return this.on(event, wrapper as E[keyof E]);
  }

  /**
   * Fire `event`, calling every listener with `args` (registration
   * order, snapshot semantics). Promises returned by async listeners
   * are not awaited — their rejections are routed to
   * {@link Events._onListenerError} (use {@link Events._emitSync} to
   * await listeners).
   */
  protected _emit<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): this {
    return this.__dispatchEvent(event, args);
  }

  /**
   * Like {@link Events._emit} but awaits each listener in turn — the
   * next listener does not start until the previous one settles.
   *
   * Unlike the fire-and-forget `_emit`, a throw/rejection here
   * PROPAGATES to the awaiting caller (and stops later listeners):
   * `_emitSync` is the deliberate, handled emission path — the caller
   * chose to await and owns the failure. Use `_emit` when emission
   * must never affect the emitter.
   */
  protected async _emitSync<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): Promise<this> {
    const callbacks = this.__events.get(event);
    if (!callbacks) {
      return this;
    }
    for (const cb of [...callbacks]) {
      await cb(...args);
    }
    return this;
  }

  /**
   * Variance-tolerant {@link Events._emit} for use inside generic base
   * classes.
   *
   * The strictly-typed `_emit` requires `Parameters<E[K]>` for its
   * args, which TypeScript can't always resolve when `E` is a generic
   * parameter (e.g. inside a base class that declares
   * `<E extends BaseEvents>`). In those contexts the call site knows
   * the event/args match `BaseEvents`, but TS refuses to project them
   * through the generic constraint. `_emitRaw` keeps the typed key
   * parameter (so typos still error) while accepting `unknown[]` args.
   * Same isolation and snapshot semantics as `_emit`.
   *
   * @example
   * ```typescript
   * type BaseEvents = { connect: (id: string) => void };
   *
   * abstract class Base<E extends BaseEvents> extends Events<E> {
   *   abstract readonly id: string;
   *
   *   protected _onConnect(): void {
   *     // Strict _emit fails: variance on E['connect'].
   *     this._emitRaw('connect', this.id); // works
   *   }
   * }
   * ```
   */
  protected _emitRaw<K extends keyof E>(event: K, ...args: unknown[]): this {
    return this.__dispatchEvent(event, args);
  }

  /**
   * Listener-fault hook: every synchronous throw and every rejection
   * from a fire-and-forget async listener lands here. The default
   * reports to `console.error`; override to route into a logger or
   * metrics. MUST NOT throw.
   */
  protected _onListenerError(event: PropertyKey, error: unknown): void {
    console.error(`[events] '${String(event)}' listener error:`, error);
  }

  /** Shared isolated dispatch for {@link Events._emit} / {@link Events._emitRaw}. */
  private __dispatchEvent<K extends keyof E>(event: K, args: unknown[]): this {
    const callbacks = this.__events.get(event);
    if (!callbacks) {
      return this;
    }
    for (const cb of [...callbacks]) {
      try {
        const out = cb(...args) as unknown;
        if (out instanceof Promise) {
          out.catch((error) => this._onListenerError(event, error));
        }
      } catch (error) {
        this._onListenerError(event, error);
      }
    }
    return this;
  }
}

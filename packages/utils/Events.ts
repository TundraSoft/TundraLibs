/**
 * @fileoverview {@link Events} — a tiny typed event emitter with
 * `on` / `off` / `once` / `emit` / `emitSync`. The generic parameter
 * `E` maps event names to their callback signatures so the compiler
 * can validate args at every call site.
 *
 * @module
 */

// deno-lint-ignore-file

/** Sync or async callback registered with {@link Events.on}. */
export type EventCallback = (...args: any[]) => unknown;

/**
 * Typed event emitter. Subclass with an `E` map of event-name to
 * callback signature; the compiler then enforces correct arg types
 * at every `on`/`emit` site.
 *
 * @typeParam E - Map of event names to callback signatures.
 *
 * @example
 * ```typescript
 * interface AppEvents {
 *   start: () => void;
 *   error: (e: Error) => void;
 * }
 * class App extends Events<AppEvents> {
 *   run() { this.emit('start'); }
 * }
 * ```
 */
export class Events<
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> {
  private readonly __events: Map<keyof E, Set<EventCallback>> = new Map();

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
   * when `callback` is omitted).
   */
  public off<K extends keyof E>(event: K, callback?: E[K]): this;
  public off<K extends keyof E>(event: K, callback?: E[K][]): this;
  public off(event: string, callback?: EventCallback | EventCallback[]) {
    if (!this.__events.has(event)) {
      return this;
    }
    if (callback === undefined) {
      this.__events.delete(event);
      return this;
    }
    const eventCallbacks = this.__events.get(event);
    if (!eventCallbacks) return this;

    if (Array.isArray(callback)) {
      for (const cb of callback) {
        eventCallbacks.delete(cb);
      }
    } else {
      eventCallbacks.delete(callback);
    }
    return this;
  }

  /** Like {@link on}, but each listener fires at most once. */
  public once<K extends keyof E>(event: K, callback: E[K]): this;
  public once<K extends keyof E>(event: K, callback: E[K][]): this;
  public once(event: string, callback: EventCallback | EventCallback[]) {
    if (Array.isArray(callback)) {
      for (const cb of callback) {
        this.once(event, cb as E[keyof E]);
      }
      return this;
    } else {
      const onceCallback = (...args: Parameters<E[keyof E]>) => {
        this.off(event, onceCallback as E[keyof E]);
        return callback(...args);
      };
      return this.on(event, onceCallback as E[keyof E]);
    }
  }

  /**
   * Fire `event` and call every listener with `args`. Listeners run
   * in registration order; promises returned by async listeners are
   * not awaited (use {@link emitSync} for that).
   */
  emit<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): this {
    const callbacks = this.__events.get(event);
    if (!callbacks) {
      return this;
    }

    for (const cb of callbacks) {
      cb(...args);
    }
    return this;
  }

  /**
   * Like {@link emit} but awaits each listener in turn — the next
   * listener does not start until the previous one resolves.
   */
  async emitSync<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): Promise<this> {
    const callbacks = this.__events.get(event);
    if (!callbacks) {
      return this;
    }

    for (const cb of callbacks) {
      await cb(...args);
    }

    return this;
  }

  /**
   * Variance-tolerant emit for use inside generic base classes.
   *
   * The strictly-typed {@link emit} requires `Parameters<E[K]>` for its args,
   * which TypeScript can't always resolve when `E` is a generic parameter
   * (e.g. inside a base class that declares `<E extends BaseEvents>`). In
   * those contexts, the call site knows the event/args match `BaseEvents`
   * but TS refuses to project them through the generic constraint.
   *
   * `_emit` keeps the typed key parameter (so typos still error) while
   * accepting `unknown[]` args. Use this only inside base classes for
   * events declared in the constrained base — never expose it as the
   * public emission API.
   *
   * @example
   * ```typescript
   * abstract class Base<E extends BaseEvents> extends Events<E> {
   *   protected _onConnect(): void {
   *     // Strict emit fails: variance on E['connect'].
   *     this._emit('connect', this.id);  // works
   *   }
   * }
   * ```
   */
  protected _emit<K extends keyof E>(event: K, ...args: unknown[]): this {
    const callbacks = this.__events.get(event);
    if (!callbacks) return this;
    for (const cb of callbacks) {
      cb(...args);
    }
    return this;
  }
}

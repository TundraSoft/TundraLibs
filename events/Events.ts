import type { Callback, EventsType, Listeners } from './types/mod.ts';

/**
 * Events class is a simple Event emitter which supports both typed and
 * untyped events.
 * There are 2 ways to trigger an event (emit):
 * - emit(event: string, ...args: any[]): void - This will trigger all
 * callbacks without waiting for each one to finish executing.
 * - emitSync(event: string, ...args: any[]): void - This will trigger all
 * callbacks waiting for each one to finish executing.
 *
 * @template E - The type of events to be used.
 * @example
 * ```ts
 * // Untyped Events
 * const events = new Events();
 * events.on('test', () => console.log('test'));
 * events.emit('test');
 * ```
 * @example
 * ```ts
 * // Typed Events
 * const events = new Events<{ test: () => void }>();
 * events.on('test', () => console.log('test'));
 * events.emit('test');
 * ```
 */
export class Events<E extends EventsType = Record<string, Callback>> {
  /**
   * The map that holds the events and their corresponding listeners.
   */
  private _events: Map<keyof E, Set<Listeners>> = new Map();

  /**
   * Adds an event listener that executes a callback when the specified event occurs.
   *
   * @typeParam K - The keys of events in the event object E.
   * @param event - The name of the event to listen for.
   * @param callback - The callback function to be executed when the event is triggered.
   * @returns A reference to the class instance for chaining.
   */
  public on<K extends keyof E>(event: K, callback: E[K]): this;

  /**
   * Adds multiple event listeners that execute callbacks when the specified event occurs.
   *
   * @typeParam K - The keys of events in the event object E.
   * @param event - The name of the event to listen for.
   * @param callbacks - An array of callback functions to be executed when the event is triggered.
   * @returns A reference to the class instance for chaining.
   */
  public on<K extends keyof E>(event: K, callback: E[K][]): this;

  /**
   * Implementation of the `on` method.
   *
   * @param event - The name of the event to listen for.
   * @param callbacks - The callback(s) to be executed when the event is triggered.
   * @returns A reference to the class instance for chaining.
   */
  public on(event: string, callbacks: Callback | Callback[]): this {
    const listeners = this._events.get(event) || new Set();
    if (Array.isArray(callbacks)) {
      for (const cb of callbacks) {
        listeners.add(cb);
      }
    } else {
      listeners.add(callbacks);
    }
    this._events.set(event, listeners);
    return this;
  }

  /**
   * Add event listener(s) that execute callback(s) once.
   *
   * @typeparam K - The keys of events in the event object E.
   * @param event - The name of the event to listen for.
   * @param callback - The callback function to be executed when the event is triggered.
   * @returns A reference to the class instance for chaining.
   */
  public once<K extends keyof E>(event: K, callback: E[K]): this;

  /**
   * Add multiple event listeners that execute callbacks once, using an array of callbacks.
   *
   * @typeparam K - The keys of events in the event object E.
   * @param event - The name of the event to listen for.
   * @param callback - An array of callback functions to be executed when the event is triggered.
   * @returns A reference to the class instance for chaining.
   */
  public once<K extends keyof E>(event: K, callback: E[K][]): this;

  /**
   * Implementation of the once method.
   *
   * @param event - The name of the event to listen for.
   * @param callback - The callback(s) to be executed when the event is triggered.
   * @returns A reference to the class instance for chaining.
   */
  public once(event: string, callback: Callback | Callback[]): this {
    if (Array.isArray(callback)) {
      for (const cb of callback) {
        this.once(event, cb as E[keyof E]);
      }
      return this;
    }
    const listen: Listeners = callback;
    listen.__once = true;
    // deno-lint-ignore no-explicit-any
    return this.on(event, listen as any);
  }

  /**
   * Unregisters event listeners for a specific event and callback.
   *
   * @typeparam K - The union of event keys of type E.
   * @param event - The event key to unregister listeners for, or undefined to clear all events.
   * @param callback - The specific callback to unregister, or an array of callbacks to unregister.
   * @returns The instance itself for method chaining.
   */
  public off<K extends keyof E>(event?: K, callback?: E[K]): this;

  /**
   * Unregisters event listeners for a specific event and an array of callbacks.
   *
   * @typeparam K - The union of event keys of type E.
   * @param event - The event key to unregister listeners for, or undefined to clear all events.
   * @param callback - The array of callbacks to unregister.
   * @returns The instance itself for method chaining.
   */
  public off<K extends keyof E>(event?: K, callback?: E[K][]): this;

  /**
   * Clears all registered event listeners.
   *
   * @returns The instance itself for method chaining.
   */
  public off(): this;
  public off(event?: string, callback?: Callback | Callback[]): this {
    if (event === undefined) {
      this._events.clear();
      return this;
    }

    const listeners = this._events.get(event);
    if (listeners !== undefined) {
      if (callback) {
        if (!Array.isArray(callback)) {
          callback = [callback];
        }
        callback.forEach((cb) => {
          listeners.delete(cb);
        });
      }
    }

    if (callback === undefined || listeners?.size === 0) {
      this._events.delete(event);
    }

    return this;
  }

  /**
   * Executes the events with the provided parameters asynchronously,
   * without waiting for previous callbacks in the same event to finish
   * before executing the next callback.
   *
   * @typeparam K - The union of event keys of type E.
   * @param event - The event key to emit.
   * @param args - The arguments to pass to the listeners.
   * @returns A promise that resolves with an array of settled promises containing return values from the listeners.
   */
  public emit<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): Promise<Array<PromiseSettledResult<ReturnType<E[K]>>>>;

  /**
   * Executes the events with the params provided asynchronously, i.e will not
   * wait for previous callback in same event to finish before executing next
   *
   * @param event - The event to emit.
   * @param args - The arguments to pass to the listeners.
   * @returns A promise that resolves with an array of unknown values from the listeners.
   */
  public emit(
    event: string,
    ...args: unknown[]
  ): Promise<Array<PromiseSettledResult<unknown>>> {
    const listeners = this._events.get(event);
    if (!listeners) {
      return Promise.resolve([]);
    }

    const promises = Array.from(listeners).map(async (listener) => {
      if (listener.__once) {
        listeners.delete(listener);
      }
      const returnValue = await listener(...args);
      return returnValue;
    });

    return Promise.allSettled(promises);
  }

  /**
   * Executes the events with the params provided sequencially, i.e it waits
   * for the previous callback to finish before executing the next one.
   *
   * @param event - The event to emit.
   * @param args - The arguments to pass to the listeners.
   * @returns A promise that resolves with an array of return values from the listeners.
   */
  public async emitSync<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): Promise<Array<ReturnType<E[K]>>>;
  /**
   * Executes the events with the params provided sequencially, i.e it waits
   * for the previous callback to finish before executing the next one.
   *
   * @param event - The event to emit.
   * @param args - The unknown arguments to pass to the listeners.
   * @returns A promise that resolves with an array of unknown values from the listeners.
   */
  public async emitSync(
    event: string,
    ...args: unknown[]
  ): Promise<Array<unknown>> {
    const listeners = this._events.get(event);
    const returnValues: Array<unknown> = [];

    if (listeners) {
      for (const listener of listeners) {
        if (listener.__once) {
          listeners.delete(listener);
        }

        try {
          const returnValue = await listener(...args);
          returnValues.push(returnValue);
        } catch (error) {
          returnValues.push(error);
        }
      }
    }

    return returnValues;
  }
}

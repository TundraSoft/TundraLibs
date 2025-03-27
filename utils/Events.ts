// deno-lint-ignore-file
export type EventCallback = (...args: any[]) => unknown | Promise<unknown>;

/**
 * A class that provides event handling capabilities.
 *
 * @template E - An object that maps event names to their corresponding callback types.
 */
export class Events<
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> {
  private __events: Map<keyof E, Set<EventCallback>> = new Map();

  /**
   * Registers an event listener for the specified event.
   *
   * @param event - The name of the event.
   * @param callback - The callback function or an array of callback functions to register.
   * @returns The current instance for chaining.
   *
   * @example
   * ```ts
   * const events = new Events();
   * events.on('hello', () => console.log('Hello, world!'));
   * events.on('hello', [() => console.log('Hello again!'), () => console.log('Hello once more!')]);
   * ```
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
   * Unregisters an event listener for the specified event.
   *
   * @param event - The name of the event.
   * @param callback - The callback function or an array of callback functions to unregister. If not provided, all listeners for the event are removed.
   * @returns The current instance for chaining.
   *
   * @example
   * ```ts
   * const events = new Events();
   * const callback = () => console.log('Hello, world!');
   * events.on('hello', callback);
   * events.off('hello', callback);
   * ```
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
        eventCallbacks.delete(cb as EventCallback);
      }
    } else {
      eventCallbacks.delete(callback);
    }
    return this;
  }

  /**
   * Registers an event listener that is called at most once for the specified event.
   *
   * @param event - The name of the event.
   * @param callback - The callback function or an array of callback functions to register.
   * @returns The current instance for chaining.
   *
   * @example
   * ```ts
   * const events = new Events();
   * events.once('hello', () => console.log('Hello, world!'));
   * events.emit('hello'); // Logs: Hello, world!
   * events.emit('hello'); // Does nothing
   * ```
   */
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
   * Emits the specified event asynchronously, calling all registered listeners with the provided arguments.
   *
   * @param event - The name of the event.
   * @param args - The arguments to pass to the event listeners.
   * @returns The current instance for chaining.
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
   * Emits the specified event synchronously, calling all registered listeners with the provided arguments.
   * Waits for each callback to complete before calling the next one.
   *
   * @param event - The name of the event.
   * @param args - The arguments to pass to the event listeners.
   * @returns A promise that resolves when all listeners have completed.
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
}

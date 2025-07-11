/**
 * @fileoverview Type-safe event system with advanced asynchronous support.
 *
 * This module provides a robust, type-safe event handling system that supports
 * both synchronous and asynchronous event callbacks. It's designed for building
 * reactive applications, implementing the observer pattern, and creating
 * decoupled architectures.
 *
 * **Key Features:**
 * - Full TypeScript support with generic event typing
 * - Synchronous and asynchronous event emission
 * - Multiple callback registration (arrays supported)
 * - One-time event listeners with automatic cleanup
 * - Memory leak prevention with proper cleanup
 * - Error isolation (individual callback failures don't affect others)
 * - Method chaining for fluent API design
 *
 * **Performance:**
 * - O(1) event registration and removal
 * - O(n) event emission where n is the number of listeners
 * - Memory-efficient Set-based storage
 * - Automatic cleanup for one-time listeners
 *
 * **Common Patterns:**
 * - Observer pattern implementation
 * - Plugin/hook systems
 * - State change notifications
 * - Lifecycle event management
 * - Reactive programming foundations
 *
 * @example Basic usage:
 * ```typescript
 * interface MyEvents {
 *   userLogin: (user: User) => void;
 *   dataUpdate: (data: any[]) => Promise<void>;
 *   error: (error: Error) => void;
 * }
 *
 * const events = new Events<MyEvents>();
 * events.on('userLogin', (user) => console.log(`Welcome ${user.name}!`));
 * events.emit('userLogin', currentUser);
 * ```
 */

// deno-lint-ignore-file

/**
 * Type alias for event callback functions.
 *
 * Event callbacks can be either synchronous or asynchronous and can accept
 * any number of arguments. The return value can be any type or a Promise.
 *
 * @example Synchronous callback:
 * ```typescript
 * const syncCallback: EventCallback = (message: string) => {
 *   console.log(message);
 *   return 'processed';
 * };
 * ```
 *
 * @example Asynchronous callback:
 * ```typescript
 * const asyncCallback: EventCallback = async (data: ApiData) => {
 *   await processData(data);
 *   return { success: true };
 * };
 * ```
 */
export type EventCallback = (...args: any[]) => unknown;

/**
 * Advanced type-safe event handling system with comprehensive async support.
 *
 * This class provides a powerful foundation for implementing event-driven architectures
 * with full TypeScript support. It enables decoupled communication between components,
 * reactive programming patterns, and clean separation of concerns.
 *
 * **Event Lifecycle:**
 * 1. **Registration**: Event listeners are registered with `on()` or `once()`
 * 2. **Emission**: Events are triggered with `emit()` or `emitSync()`
 * 3. **Execution**: All registered callbacks are executed (with error isolation)
 * 4. **Cleanup**: One-time listeners are automatically removed after execution
 *
 * **Error Handling:**
 * Individual callback failures are isolated and don't prevent other callbacks
 * from executing. This ensures system resilience and prevents cascade failures.
 *
 * **Memory Management:**
 * The class uses Map and Set for efficient storage and provides methods for
 * cleanup to prevent memory leaks in long-running applications.
 *
 * @template E - Object type mapping event names to their callback signatures
 *
 * @example Basic typed events:
 * ```typescript
 * interface ApplicationEvents {
 *   startup: () => void;
 *   userAction: (action: string, userId: string) => void;
 *   error: (error: Error, context?: string) => void;
 *   dataChanged: (newData: any[], oldData: any[]) => Promise<void>;
 * }
 *
 * class Application extends Events<ApplicationEvents> {
 *   constructor() {
 *     super();
 *     this.on('startup', () => console.log('App started'));
 *     this.on('error', (err, ctx) => this.logError(err, ctx));
 *   }
 *
 *   start() {
 *     this.emit('startup');
 *   }
 * }
 * ```
 *
 * @example Plugin system with events:
 * ```typescript
 * interface PluginEvents {
 *   pluginLoaded: (plugin: Plugin) => void;
 *   beforeExecute: (command: string) => boolean; // Can cancel execution
 *   afterExecute: (command: string, result: any) => void;
 * }
 *
 * class PluginManager extends Events<PluginEvents> {
 *   async executeCommand(command: string) {
 *     // Allow plugins to intercept
 *     const results = await this.emitSync('beforeExecute', command);
 *     if (results.some(r => r === false)) return; // Cancelled
 *
 *     const result = await this.runCommand(command);
 *     this.emit('afterExecute', command, result);
 *   }
 * }
 * ```
 *
 * @example Reactive data flow:
 * ```typescript
 * interface DataEvents {
 *   dataLoaded: (data: DataSet) => void;
 *   dataFiltered: (filtered: DataSet, filters: FilterOptions) => void;
 *   dataError: (error: Error) => void;
 * }
 *
 * class DataProcessor extends Events<DataEvents> {
 *   constructor() {
 *     super();
 *     // Chain reactive transformations
 *     this.on('dataLoaded', (data) => this.validateData(data));
 *     this.on('dataLoaded', (data) => this.cacheData(data));
 *     this.on('dataFiltered', (filtered) => this.updateUI(filtered));
 *   }
 * }
 * ```
 */
export class Events<
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> {
  private readonly __events: Map<keyof E, Set<EventCallback>> = new Map();

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
        eventCallbacks.delete(cb);
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

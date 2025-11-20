import { type EventCallback, Events } from "./Events.ts";
import { type PrivateObject, privateObject } from "../utils/mod.ts";

/**
 * Helper type that combines option keys with event handler keys prefixed with '_on'.
 *
 * This utility type creates a configuration object that supports both:
 * - Regular options (all made optional to allow for defaults)
 * - Event handlers with the `_on` prefix (e.g., `_onchange`, `_onerror`)
 *
 * @template O - Object type mapping option keys to their value types
 * @template E - Object type mapping event names to their callback types
 *
 * @example Basic usage:
 * ```typescript
 * type MyOptions = { timeout: number; enabled: boolean };
 * type MyEvents = { change: (value: string) => void; error: (err: Error) => void };
 *
 * type Config = EventOptionKeys<MyOptions, MyEvents>;
 * // Result: {
 * //   timeout?: number;
 * //   enabled?: boolean;
 * //   _onchange?: (value: string) => void | Array<(value: string) => void>;
 * //   _onerror?: (err: Error) => void | Array<(err: Error) => void>;
 * // }
 * ```
 *
 * @example Multiple event handlers:
 * ```typescript
 * const config: EventOptionKeys<{}, { click: () => void }> = {
 *   _onclick: [handler1, handler2, handler3] // Multiple handlers supported
 * };
 * ```
 */
export type EventOptionKeys<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> =
  & {
    [K in keyof O]?: O[K]; // Make everything optional to allow for defaults
  }
  & {
    [K in keyof E as `_on${string & K}`]?: E[K] | E[K][];
  };

/**
 * Abstract base class that provides comprehensive options and event handling capabilities.
 *
 * This class combines the functionality of the Events system with a robust options
 * management system, allowing classes to:
 * - Store and retrieve typed configuration options
 * - Handle default values for options
 * - Validate and transform option values
 * - Register event handlers through the constructor
 * - Maintain type safety throughout
 *
 * The class uses a private object store to encapsulate options, ensuring they
 * cannot be directly modified outside of the controlled setter methods.
 *
 * @template O - Object type defining the available options and their types
 * @template E - Object type defining the available events and their callback signatures
 *
 * @example Basic usage with typed options:
 * ```typescript
 * interface DatabaseOptions {
 *   host: string;
 *   port: number;
 *   ssl?: boolean;
 * }
 *
 * interface DatabaseEvents {
 *   connect: () => void;
 *   error: (error: Error) => void;
 *   query: (sql: string) => void;
 * }
 *
 * class Database extends Options<DatabaseOptions, DatabaseEvents> {
 *   constructor(config: EventOptionKeys<DatabaseOptions, DatabaseEvents>) {
 *     super();
 *     this._setOptions(config, { port: 5432, ssl: false }); // Set defaults
 *   }
 *
 *   connect() {
 *     const host = this.getOption('host');
 *     const port = this.getOption('port');
 *     // Connection logic...
 *     this.emit('connect');
 *   }
 *
 *   protected override _processOption<K extends keyof DatabaseOptions>(
 *     key: K,
 *     value: DatabaseOptions[K]
 *   ): DatabaseOptions[K] {
 *     if (key === 'port' && (typeof value !== 'number' || value < 1 || value > 65535)) {
 *       throw new Error('Port must be between 1 and 65535');
 *     }
 *     return value;
 *   }
 * }
 *
 * const db = new Database({
 *   host: 'localhost',
 *   port: 3306,
 *   _onconnect: () => console.log('Connected!'),
 *   _onerror: (err) => console.error('Database error:', err)
 * });
 * ```
 *
 * @example Advanced usage with validation:
 * ```typescript
 * class ConfigurableWidget extends Options<
 *   { theme: 'light' | 'dark'; size: number },
 *   { themechange: (theme: string) => void }
 * > {
 *   constructor(options: EventOptionKeys<{ theme: 'light' | 'dark'; size: number }, { themechange: (theme: string) => void }>) {
 *     super();
 *     this._setOptions(options, { theme: 'light', size: 100 });
 *   }
 *
 *   setTheme(theme: 'light' | 'dark') {
 *     this._setOption('theme', theme);
 *     this.emit('themechange', theme);
 *   }
 *
 *   protected override _processOption(key: string, value: unknown) {
 *     if (key === 'size' && (typeof value !== 'number' || value <= 0)) {
 *       throw new Error('Size must be a positive number');
 *     }
 *     return value;
 *   }
 * }
 * ```
 *
 * @example Event registration through constructor:
 * ```typescript
 * const widget = new ConfigurableWidget({
 *   theme: 'dark',
 *   size: 200,
 *   _onthemechange: (theme) => document.body.className = theme,
 * });
 * ```
 */
export abstract class Options<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> extends Events<E> {
  private readonly __options: PrivateObject<O> = privateObject<O>();

  constructor() {
    super();
    // Note: Subclasses should call _setOptions in their constructor to initialize options
  }

  /**
   * Checks if an option exists.
   *
   * @param key - The key of the option to check.
   * @returns A boolean indicating whether the option exists.
   */
  public hasOption<K extends keyof O>(key: K): boolean {
    return this.__options.has(key);
  }

  /**
   * Gets the value of an option.
   *
   * @param key - The key of the option to get.
   * @returns The value of the option.
   */
  public getOption<K extends keyof O>(key: K): O[K] {
    return this.__options.get(key);
  }

  /**
   * Gets all options.
   *
   * @returns An object containing all options.
   */
  public getOptions(): O {
    return this.__options.asObject();
  }

  /**
   * Sets a single option.
   *
   * @param key - The key of the option to set.
   * @param value - The value of the option to set.
   * @returns The current instance for chaining.
   */
  protected _setOption<K extends keyof O>(key: K, value: O[K]): this {
    this.__options.set(key, this._processOption(key, value));
    return this;
  }

  /**
   * Sets multiple options.
   *
   * @param options - An object containing the options to set.
   * @returns The current instance for chaining.
   */
  protected _setOptions(
    options: EventOptionKeys<O, E>,
    defaults?: Partial<O>,
  ): this {
    // First set the defaults and explicitly type it
    // Start with defaults
    const finalOptions = { ...defaults } as EventOptionKeys<O, E>;

    // Apply non-undefined values from options (excluding event handlers)
    for (const key in options) {
      // Skip undefined values
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        (finalOptions as Record<string, unknown>)[key] = options[key];
      }
    }
    // Loop through and set each option
    for (const key in finalOptions) {
      if (key.startsWith("_on")) {
        this.on(
          key.slice(3) as keyof E,
          finalOptions[key] as unknown as E[keyof E],
        );
      } else {
        this._setOption(key as keyof O, finalOptions[key] as O[keyof O]);
      }
    }
    return this;
  }

  /**
   * Process an option before storing it. Subclasses can override this to implement validation
   * or transformation of option values.
   *
   * @param key - The key of the option to process.
   * @param value - The value of the option to process.
   * @returns The processed option value.
   */
  protected _processOption(key: keyof O, value: O[typeof key]): O[typeof key] {
    return value;
  }
}

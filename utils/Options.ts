import { type EventCallback, Events } from './Events.ts';
import { type PrivateObject, privateObject } from '../utils/mod.ts';

/**
 * Helper type which creates an object with both the option keys and the event
 * names with a _ prefix.
 */
export type EventOptionsKeys<
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
 * A class that provides options handling capabilities.
 *
 * @template O - An object that maps option keys to their corresponding value types.
 * @template E - An object that maps event names to their corresponding callback types.
 *
 * @example
 * ```ts
 * class MyOptions extends Options<{ foo: string, bar: number }, { baz: () => void }> {
 *  constructor(options: EventOptionsKeys<{ foo: string, bar: number }, { baz: () => void }>,) {
 *   super(options, { foo: 'default', bar: 0 }); // Set default value if desired
 *  }
 *  test() {
 *   console.log(this.getOption('foo'));
 *   this.on('baz', () => console.log('Baz event fired!'));
 *   this.emit('baz');
 *  }
 * }
 * ```(val: unknown) => asserts val is string
 */
export abstract class Options<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> extends Events<E> {
  private readonly __options: PrivateObject<O> = privateObject<O>();

  constructor(
    options: EventOptionsKeys<O, E>,
    defaults?: Partial<O>,
  ) {
    super();
    // First set the defaults and explicitly type it
    // Start with defaults
    const finalOptions = { ...defaults } as EventOptionsKeys<O, E>;

    // Apply non-undefined values from options (excluding event handlers)
    for (const key in options) {
      // Skip undefined values
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        (finalOptions as Record<string, unknown>)[key] = options[key];
      }
    }
    this._setOptions(finalOptions);
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
    options: EventOptionsKeys<O, E>,
  ): this {
    // Loop through and set each option
    for (const key in options) {
      if (key.startsWith('_on')) {
        this.on(key.slice(3) as keyof E, options[key] as unknown as E[keyof E]);
      } else {
        this._setOption(key as keyof O, options[key] as O[keyof O]);
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

import { OptionsKey, OptionsType } from './types.ts';
import { EventName, Events, EventsType } from '/root/events/mod.ts';

// Options.ts
/**
 * Options
 *
 * A helper class which helps manage class options. A class will typically extend this
 * class and provide the ability to load and manage options.
 * ```ts
 * import { Options } from "./mod.ts"
 *
 * type iOptionTest = {
 *  value1: string;
 *  value2: number;
 *  value3: {
 *    value31: boolean
 *  }
 *  value44?: string;
 * }
 *
 * class TypedOptions extends Options<iOptionTest> {
 *  constructor(options: NonNullable<iOptionTest>, defaults?: Partial<iOptionTest>) {
 *    super(options, defaults);
 *  }
 *
 *  public someOtherFunc() {
 *    console.log(this._getOption("value1")); // returns value1's value
 *    console.log(this._getOption("value3").value31); // returns value3 -> value31's boolean output
 *    console.log(this._options.value3?.value31);
 *    console.log(this._options.value44);
 *  }
 * }
 *
 * let typedOption: Test = new TypedOptions({value1: 'dff', value2: 23, value3: {value31: true}}, {value1: "abc"});
 * typedOption.someOtherFunc();
 * ```
 *
 * @todo Option value validation - Right now we only validate type and not value
 * @todo Nested options access. Currently only top level options can be access directly.
 */
export class Options<
  T extends OptionsType = Record<OptionsKey, unknown>,
  // deno-lint-ignore no-explicit-any
  E extends EventsType = Record<EventName, any>,
> extends Events<E> {
  protected _options: T | NonNullable<T>;

  constructor(options: T | NonNullable<T> | Partial<T>, defaults?: Partial<T>);

  /**
   * Initialized the class. Sets the options sent during class initialization
   *
   * @param options Object The actual options
   * @param defaults Object Default values for options
   */
  constructor(
    options: Record<OptionsKey, unknown>,
    defaults?: Record<OptionsKey, unknown>,
  ) {
    super();
    // Initialize Options
    this._options = {} as T;
    // First add defaults if present
    if (defaults) {
      this._setOptions(defaults);
    }
    // Now set the options provided
    this._setOptions(options);
  }

  protected _hasOption<K extends keyof T>(name: K): boolean;

  /**
   * A small helper function to check if a option key exists, and if it
   * does, it also check if value is not null or undefined.
   *
   * @param name Option key to check
   * @returns Boolean, true if exists false if it does not
   */
  protected _hasOption(name: OptionsKey): boolean {
    if (this._options[name] !== undefined) {
      return true;
    }
    return false;
  }

  protected _getOption<K extends keyof T>(name: K): T[K];

  /**
   * Gets an option value basis the key provided as input.
   *
   * @param name string The option name for which value is needed
   * @returns any - Returns the option value
   */
  protected _getOption(name: OptionsKey): unknown {
    if (this._hasOption(name)) {
      return this._options[name];
    }
    return undefined;
  }

  protected _setOption<K extends keyof T>(name: K, value: T[K]): this;

  /**
   * Sets an option value.
   *
   * @param name string The name of the option
   * @param value the value which is to be set
   * @returns reference to this class
   */
  protected _setOption(name: OptionsKey, value: unknown): this {
    // deno-lint-ignore no-explicit-any
    this._options[name as keyof T] = value as any;
    return this;
  }

  /**
   * Bulk set options data by deep cloning the object.
   *
   * @param options All option data
   * @returns Reference to this class
   */
  protected _setOptions(options: Partial<T> | OptionsType): this {
    for (const key in options) {
      // deno-lint-ignore no-explicit-any
      this._setOption(key, options[key] as any);
    }
    return this;
  }
}

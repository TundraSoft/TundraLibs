// Options.ts
/**
 * Options
 *
 * A helper class which helps manage class options. A class will typically extend this
 * class and provide the ability to load and manage options.
 * ```ts
 * import { Options } from "./mod.ts"
 * interface iOptionTest {
 *  value1: string,
 *  value2: number,
 *  value3: {
 *    value31: boolean
 *  }
 * }
 *
 * class Test extends Options<iOptionTest> {
 *  constructor(options: iOptionTest) {
 *    super(options, true);
 *  }
 *
 *  public someOtherFunc() {
 *    console.log(this._getOption('value1')) // returns value1's value
 *    console.log(this._getOption('value3').value31); // returns value3 -> value31's boolean output
 *    console.log(this._options.value3.value31);
 *  }
 * }
 *
 * let a: Test = new Test({value1: 'dff', value2: 23, value3: {value31: true}});
 * a.someOtherFunc();
 * ```
 *
 * @todo Option value validation - Right now we only validate type and not value
 * @todo Nested options access. Currently only top level options can be access directly.
 */
 export class Options<T = {}> {
  protected _options: T;
  protected _editable = true;

  /**
   * Initialized the class. Sets the options sent during class initialization
   *
   * @param options Object The actual options
   * @param defaults Object Default values for options
   * @param editable Enable editing of the options post initialization
   */
  constructor(
    options?: Partial<T>,
    defaults?: Partial<T>,
    editable: boolean = false,
  ) {
    // We need to initialize options. So this is workaround :)
    let a: Partial<T> = {};
    if (defaults) {
      a = defaults;
    }
    this._options = a as T;
    if (options) {
      this._setOptions(options as T);
    }
    this._editable = editable;
  }

  /**
   * A small helper function to check if a option key exists, and if it
   * does, it also check if value is not null or undefined.
   *
   * @param name Option key to check
   * @returns Boolean, true if exists false if it does not
   */
  protected _hasOption(name: string): boolean {
    // return (name in this._options);
    if (name in this._options) {
      const val = this._getOption(name as keyof T);
      if (val !== undefined && val !== null) {
        return true;
      }
    }
    return false;
  }

  /**
   * Bulk set options data by deep cloning the object.
   *
   * @param options All option data
   * @returns Reference to this class
   */
  protected _setOptions(options: T) {
    for (const key in options) {
      this._setOption(key, options[key]);
    }
    return this;
  }

  protected _setOption<K extends keyof T>(name: K, value: T[K]): this;

  /**
   * Sets an option value if editable is set to true.
   *
   * @param name string The name of the option
   * @param value the value which is to be set
   * @returns reference to this class
   */
  protected _setOption(name: string | number, value: any): this {
    if (this._editable) {
      this._options[name as keyof T] = value;
    }
    return this;
  }

  protected _getOption<K extends keyof T>(name: K): T[K];

  /**
   * Gets an option value basis the key provided as input.
   *
   * @param name string The option name for which value is needed
   * @returns any - Returns the option value
   */
  protected _getOption(name: string | number): any {
    return this._options[name as keyof T];
  }
}

// Options.ts
type OptionType = {
  [key: string]: unknown
}

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
export default class Options<T extends OptionType = Record<string, any>> {
  protected _options: T;
  protected _editable = true;
  constructor(options: T) {
    this._options = options;
  }
}

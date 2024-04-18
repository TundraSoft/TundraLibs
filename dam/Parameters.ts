import { alphaNumeric, nanoId } from '../id/mod.ts';

/**
 * Parameters
 *
 * A helper class to manage parameters in a SQL query.
 * Its base purpose is to create a unique name for each parameter value and ensure
 * only one parameter is created for each unique value.
 */
export class Parameters {
  private _params: Map<unknown, string> = new Map();
  private _counter = 0;
  public readonly prefix = nanoId(5, alphaNumeric);

  /**
   * Creates a new Parameters instance.
   *
   * @param prefix - The prefix to use for parameter names.
   */
  constructor(prefix?: string) {
    this.prefix = prefix || nanoId(5, alphaNumeric);
  }

  /**
   * Creates a new parameter basis the valie. If the value already exists,
   * it returns the existing parameter name.
   *
   * @param value unknown The value to create a parameter for.
   * @returns string The parameter name
   */
  create(value: unknown): string {
    if (value instanceof Object && !(value instanceof Date)) {
      value = JSON.stringify(value);
    }
    if (this._params.has(value)) {
      return this._params.get(value) as string;
    } else {
      const name = `p_${this.prefix}_${this._counter++}`;
      this._params.set(value, name);
      return name;
    }
  }

  /**
   * Gets the number of parameters.
   */
  get size() {
    return this._params.size;
  }

  /**
   * Converts the parameters to a record.
   *
   * @returns Record<string, unknown> The parameters as a record.
   */
  asRecord() {
    const record: Record<string, unknown> = {};
    this._params.forEach((value, key) => {
      record[value] = key;
    });
    return record;
  }
}

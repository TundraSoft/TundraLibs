/**
 * Manages query parameters with automatic name generation and deduplication.
 *
 * This class is useful when building dynamic queries where the exact parameter
 * names are not known in advance, or when the same value needs to be used
 * multiple times in a query.
 *
 * @example Basic usage
 * ```typescript
 * const params = new QueryParameters();
 *
 * // Create named parameters
 * const userId = params.create(123);      // "P_0"
 * const status = params.create('active'); // "P_1"
 *
 * // The same value gets the same parameter name
 * const sameUserId = params.create(123);  // "P_0" (reused)
 *
 * // Use in SQL
 * const sql = `SELECT * FROM users WHERE id = :${userId}: AND status = :${status}:`;
 * // "SELECT * FROM users WHERE id = :P_0: AND status = :P_1:"
 *
 * // Generate the complete parameter object for the engine
 * const paramObject = params.asRecord();
 * // { "P_0": 123, "P_1": "active" }
 * ```
 *
 * @example Custom prefix
 * ```typescript
 * const params = new QueryParameters('user');
 * const id = params.create(42); // "user_0"
 * ```
 */
export class QueryParameters {
  /** Prefix for generated parameter names */
  public readonly prefix: string;

  /** Internal map of values to parameter names */
  private _params: Map<unknown, string> = new Map();

  /** Counter for generating unique parameter names */
  private _counter = 0;

  /**
   * Creates a new QueryParameters instance
   *
   * @param prefix - Prefix to use for parameter names (default: "P")
   */
  constructor(prefix: string = 'P') {
    this.prefix = prefix.trim() || 'P';
  }

  /**
   * Creates or retrieves a parameter name for the given value
   *
   * If the value has been seen before, the existing parameter name is returned.
   * Otherwise, a new parameter name is generated using the prefix and counter.
   *
   * Special handling for objects: they are stringified for comparison.
   *
   * @param value - The parameter value to store
   * @returns The parameter name (e.g., "P_0", "P_1")
   */
  create(value: unknown): string {
    if (value instanceof Object && !(value instanceof Date)) {
      value = JSON.stringify(value);
    }
    if (this._params.has(value)) {
      return this._params.get(value) as string;
    } else {
      const name = `${this.prefix}_${this._counter++}`;
      this._params.set(value, name);
      return name;
    }
  }

  /**
   * Returns the number of unique parameters stored
   */
  get size() {
    return this._params.size;
  }

  /**
   * Converts the parameters to a plain object
   *
   * The returned object maps parameter names to their values,
   * ready to be used in query execution.
   *
   * @returns Record with parameter names as keys and values as values
   */
  asRecord() {
    const record: Record<string, unknown> = {};
    this._params.forEach((name, value) => {
      record[name] = value;
    });
    return record;
  }
}

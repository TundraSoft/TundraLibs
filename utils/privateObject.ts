/**
 * Represents a private object with getter, setter, and utility methods.
 *
 * @typeparam T - The type of the internal data object.
 */
export type PrivateObject<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  /**
   * Retrieves the value associated with the specified key from the internal data object.
   *
   * @param key - The key to retrieve the value for.
   * @returns The value associated with the key.
   */
  get: <K extends keyof T>(key: K) => T[K];
  /**
   * Checks if the specified key exists in the internal data object.
   *
   * @param key - The key to check for existence.
   * @returns A boolean indicating whether the key exists.
   */
  has: <K extends keyof T>(key: K) => boolean;
  /**
   * Sets the value associated with the specified key in the internal data object.
   *
   * @param key - The key to set the value for.
   * @param value - The value to set.
   */
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  /**
   * Deletes the value associated with the specified key from the internal data object.
   *
   * @param key - The key to delete the value for.
   */
  delete: <K extends keyof T>(key: K) => void;
  /**
   * Executes the specified callback function for each key-value pair in the internal data object.
   *
   * @param callback - The callback function to execute for each key-value pair.
   */
  forEach: <K extends keyof T>(callback: (key: K, value: T[K]) => void) => void;
  /**
   * Retrieves an array of keys from the internal data object.
   *
   * @returns An array of strings representing the keys.
   */
  keys: () => string[];
  /**
   * Clears all key-value pairs from the internal data object.
   */
  clear: () => void;
};

/**
 * Creates a private object with getter, setter, and utility methods.
 *
 * @typeparam T - The type of the internal data object.
 * @param data - The initial data for the private object.
 * @param enableMutations - A boolean flag indicating whether mutations are enabled.
 * @returns A private object instance.
 */
export const privateObject = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  data?: T,
  enableMutations = true,
): PrivateObject<T> => {
  const _data = data || {} as T;
  return {
    get: <K extends keyof T>(key: K) => _data[key],
    has: <K extends keyof T>(key: K) => key in _data,
    set: <K extends keyof T>(
      key: K,
      value: T[K],
    ) => (enableMutations && (_data[key] = value)),
    delete: <K extends keyof T>(
      key: K,
    ) => (enableMutations && (delete _data[key])),
    forEach: <K extends keyof T>(callback: (key: K, value: T[K]) => void) => {
      for (const key of Object.keys(_data) as K[]) {
        callback(key, _data[key]);
      }
    },
    keys: () => Object.keys(_data),
    clear: () => (enableMutations &&
      Object.keys(_data).forEach((key) => delete _data[key])),
  };
};

// Path: utils/envArgs.ts

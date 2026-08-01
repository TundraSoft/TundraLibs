/**
 * @fileoverview `privateObject(data)` — a small key/value wrapper that
 * exposes get/set/has/delete/keys but hides the underlying record.
 * With mutations disabled it acts as a read-only view (writes silently
 * no-op rather than throw).
 *
 * @module
 */

/**
 * Controlled accessor for a hidden record. With mutations enabled all
 * methods behave as expected; with mutations disabled `set`, `delete`,
 * and `clear` return without changing state.
 *
 * @typeParam T - Shape of the wrapped record.
 */
export type PrivateObject<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  get: <K extends keyof T>(key: K) => T[K];
  has: <K extends keyof T>(key: K) => boolean;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  delete: <K extends keyof T>(key: K) => void;
  forEach: <K extends keyof T>(callback: (key: K, value: T[K]) => void) => void;
  keys: () => string[];
  clear: () => void;
  /**
   * The wrapped record. With mutations enabled this is the live
   * internal reference; with mutations disabled it is a defensive
   * shallow copy, so callers cannot mutate the hidden record through
   * the returned value and defeat the read-only guarantee.
   */
  asObject: () => T;
};

/**
 * Wrap `data` (or an empty object) in a {@link PrivateObject}.
 *
 * @typeParam T - Shape of the record to wrap.
 * @param data - Initial state. The record is held by reference; the
 *   wrapper does not copy it.
 * @param enableMutations - When `false`, `set`/`delete`/`clear`
 *   silently no-op. Defaults to `true`.
 *
 * @example
 * ```typescript
 * const config = privateObject({ host: 'localhost' }, false);
 * config.get('host');             // 'localhost'
 * config.set('host', 'override'); // no-op
 * config.get('host');             // 'localhost'
 * ```
 */
export const privateObject = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  data?: T,
  enableMutations = true,
): PrivateObject<T> => {
  const _data = data ?? {} as T;
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
    // Mutable: hand back the live record. Read-only: hand back a
    // defensive shallow copy so a caller can't mutate the hidden store
    // through the returned reference and bypass the no-op writes.
    asObject: () => (enableMutations ? _data : { ..._data } as T),
  };
};

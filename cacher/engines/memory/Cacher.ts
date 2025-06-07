import { type PrivateObject, privateObject } from '@tundralibs/utils';
import { AbstractCacher } from '../../AbstractCacher.ts';
import type { CacheValue } from '../../types/mod.ts';
import type { MemoryCacherOptions } from './types/mod.ts';

/**
 * In-memory cacher implementation.
 *
 * Provides caching functionality using the process memory. This implementation:
 * - Stores data in-memory (non-persistent)
 * - Supports expiry times via setTimeout
 * - Implements window mode to extend expiry on access
 *
 * Note: This cacher is local to the current process and doesn't support sharing
 * across multiple processes or servers.
 *
 * @extends AbstractCacher<MemoryCacherOptions>
 * @see {@link AbstractCacher} for details on the base implementation
 * @see {@link MemoryCacherOptions} for configuration options
 * @example
 * ```ts
 * // Create a memory cacher
 * const cache = new MemoryCacher('user-cache', {});
 *
 * // Set a value with 5 minute expiry
 * await cache.set('user:1', { name: 'John', role: 'admin' }, { expiry: 300 });
 *
 * // Get a value
 * const user = await cache.get('user:1');
 *
 * // Clear the cache when done
 * await cache.clear();
 * ```
 */
export class MemoryCacher extends AbstractCacher<MemoryCacherOptions> {
  /**
   * The engine identifier for in-memory cacher.
   */
  public readonly Engine = 'MEMORY';

  /**
   * Internal storage for cached values.
   * @protected
   */
  protected _cache: PrivateObject<{ [key: string]: CacheValue }> =
    privateObject<{ [key: string]: CacheValue }>();

  /**
   * Map of expiry timers for cached values.
   * @protected
   */
  protected _expiryTimers: Map<string, number> = new Map();

  /**
   * Creates a new in-memory cacher instance.
   *
   * @param name - A unique name for this cacher instance
   * @param options - Configuration options for this cacher
   */
  constructor(name: string, options: Partial<MemoryCacherOptions>) {
    super(name, options);
  }

  /**
   * Finalizes the in-memory cacher by clearing all cached values.
   *
   * @returns A promise that resolves when the operation is complete
   * @override
   */
  public override finalize(): void {
    this._clear();
  }

  //#region Abstract methods
  /**
   * Stores a value in memory.
   * Sets up an expiry timer if an expiry time is specified.
   *
   * @param key - The normalized key
   * @param value - The value to store
   * @protected
   * @override
   */
  protected _set(key: string, value: CacheValue): void {
    // Implementation for setting a value in memory
    this._cache.set(key, value);
    if (value.expiry && value.expiry > 0) {
      this._expiryTimers.set(
        key,
        setTimeout(() => {
          this._delete(key);
        }, value.expiry * 1000),
      );
    }
  }

  /**
   * Retrieves a value from memory.
   * Resets the expiry timer if window mode is enabled.
   *
   * @param key - The normalized key
   * @returns The cached value, or undefined if not found
   * @protected
   * @override
   */
  protected _get(key: string): CacheValue | undefined {
    const val = this._cache.get(key);
    if (val && (val.window === true && val.expiry > 0)) {
      clearTimeout(this._expiryTimers.get(key));
      this._expiryTimers.set(
        key,
        setTimeout(() => {
          this._delete(key);
        }, val.expiry * 1000),
      );
    }
    return val;
  }

  /**
   * Checks if a key exists in memory.
   *
   * @param key - The normalized key
   * @returns True if the key exists, false otherwise
   * @protected
   * @override
   */
  protected _has(key: string): boolean {
    // Implementation for checking if a key exists in memory
    return this._cache.has(key);
  }

  /**
   * Deletes a value from memory and clears its expiry timer.
   *
   * @param key - The normalized key
   * @protected
   * @override
   */
  protected _delete(key: string): void {
    // Implementation for deleting a key from memory
    clearTimeout(this._expiryTimers.get(key));
    this._expiryTimers.delete(key);
    this._cache.delete(key);
  }

  /**
   * Clears all values from memory and cancels all expiry timers.
   *
   * @protected
   * @override
   */
  protected _clear(): void {
    // Implementation for clearing all keys in memory
    this._expiryTimers.forEach((timer) => clearTimeout(timer));
    this._expiryTimers.clear();
    this._cache.clear();
  }
  //#endregion Abstract methods
}

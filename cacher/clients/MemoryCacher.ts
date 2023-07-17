import { Options } from '../../options/mod.ts';
import type { OptionKeys } from '../../options/mod.ts';
import { BaseCacher } from '../BaseCacher.ts';
import type { CacheValue, MemoryCacherOptions } from '../types/mod.ts';

/**
 * Cache implementation that stores data in memory.
 * @typeParam O - The options type.
 */
export class MemoryCacher<O extends MemoryCacherOptions = MemoryCacherOptions>
  extends BaseCacher<O> {
  protected _cache: Map<string, CacheValue> = new Map();
  protected _expiryTimers: Map<string, number> = new Map();

  /**
   * Constructs a new instance of the MemoryCacher class.
   *
   * @param options - The options to initialize the cache with.
   */
  constructor(options: OptionKeys<O>) {
    super(options);
  }

  /**
   * Checks if a key exists in the cache.
   *
   * @param key - The key to check.
   * @returns True if the key exists, false otherwise.
   */
  protected _has(key: string): boolean {
    return this._cache.has(key);
  }

  /**
   * Sets a value in the cache.
   *
   * @param key - The key to associate the value with.
   * @param value - The value to set.
   */
  protected _set(key: string, value: CacheValue): void {
    this._cache.set(key, value);
    if (value.expiry > 0) {
      this._setExpiry(key, value.expiry);
    }
  }

  /**
   * Retrieves a value from the cache.
   *
   * @typeParam T - The value type.
   * @param key - The key associated with the value.
   * @returns The retrieved value if it exists, undefined otherwise.
   */
  protected _get<T>(key: string): CacheValue<T> | undefined {
    const value = this._cache.get(key);
    if (value && (value.expiry > 0 && value.window)) {
      this._setExpiry(key, value.expiry);
    }
    return value as CacheValue<T> | undefined;
  }

  /**
   * Deletes a key-value pair from the cache.
   *
   * @param key - The key to delete.
   */
  protected _delete(key: string): void {
    const timer = this._expiryTimers.get(key);
    clearTimeout(timer);
    this._expiryTimers.delete(key);
    this._cache.delete(key);
  }

  /**
   * Clears the entire cache.
   */
  protected _clear(): void {
    for (const timer of this._expiryTimers.values()) {
      clearTimeout(timer);
    }
    this._cache.clear();
    this._expiryTimers.clear();
  }

  /**
   * Sets the expiry timer for a cached value.
   *
   * @param key - The key associated with the value.
   * @param expiry - The expiry time in seconds.
   */
  protected _setExpiry(key: string, expiry: number): void {
    const timer = this._expiryTimers.get(key);
    clearTimeout(timer);
    this._expiryTimers.delete(key);
    const timeout = setTimeout(() => {
      this._delete(key);
    }, expiry * 1000);
    this._expiryTimers.set(key, timeout);
  }
}

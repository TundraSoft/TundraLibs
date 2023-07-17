import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';

import type {
  BaseCacherOptions,
  CacheSettings,
  CacheValue,
} from './types/mod.ts';

/**
 * Base class for implementing a cache.
 * @typeParam O - The options type.
 */
export abstract class BaseCacher<O extends BaseCacherOptions>
  extends Options<O> {
  /**
   * Constructs a new instance of the BaseCacher class.
   * @param options - The options to initialize the cache with.
   */
  constructor(options: OptionKeys<O>) {
    super(options, { defaultExpiry: 10 * 60 } as Partial<O>);
  }

  /**
   * Checks if a key exists in the cache.
   *
   * @param key - The key to check.
   * @returns True if the key exists, false otherwise.
   */
  public async has(key: string): Promise<boolean> {
    const cleanedKey = this._cleanKey(key);
    return await this._has(cleanedKey);
  }

  /**
   * Sets a value in the cache.
   *
   * @typeParam T - The value type.
   * @param key - The key to associate the value with.
   * @param value - The value to set.
   * @param cacheOptions - Optional cache settings.
   */
  public async set<T>(
    key: string,
    value: T,
    cacheOptions?: CacheSettings,
  ): Promise<void> {
    const cleanedKey = this._cleanKey(key);
    const valObj: CacheValue = {
      value,
      expiry: cacheOptions?.expiry ||
        this._getOption('defaultExpiry') as number,
      window: cacheOptions?.window || false,
    };
    await this._set(cleanedKey, valObj);
  }

  /**
   * Retrieves a value from the cache.
   *
   * @typeParam T - The value type.
   * @param key - The key associated with the value.
   * @returns The retrieved value if it exists, undefined otherwise.
   */
  public async get<T>(key: string): Promise<T | undefined> {
    const cleanedKey = this._cleanKey(key);
    return (await this._get<T>(cleanedKey))?.value;
  }

  /**
   * Deletes a key-value pair from the cache.
   *
   * @param key - The key to delete.
   */
  public async delete(key: string): Promise<void> {
    const cleanedKey = this._cleanKey(key);
    await this._delete(cleanedKey);
  }

  /**
   * Clears the entire cache.
   */
  public async clear(): Promise<void> {
    await this._clear();
  }

  /**
   * Actual implementation of has method.
   *
   * @param key - The key to check.
   * @returns True if the key exists, false otherwise.
   */
  protected abstract _has(key: string): Promise<boolean> | boolean;

  /**
   * Actual implementation of the set method.
   *
   * @param key - The key to associate the value with.
   * @param value - The value to set.
   */
  protected abstract _set(key: string, value: CacheValue): Promise<void> | void;

  /**
   * Actual implementation of the get method.
   *
   * @typeParam T - The value type.
   * @param key - The key associated with the value.
   * @returns The retrieved value if it exists, undefined otherwise.
   */
  protected abstract _get<T>(
    key: string,
  ): Promise<CacheValue<T> | undefined> | CacheValue<T> | undefined;

  /**
   * Actual implementation of the delete method.
   *
   * @param key - The key to delete.
   */
  protected abstract _delete(key: string): Promise<void> | void;

  /**
   * Actual implementation of clear method
   */
  protected abstract _clear(): Promise<void> | void;

  /**
   * Cleans the given key by prefixing it with the cache name.
   *
   * @param key - The key to clean.
   * @returns The cleaned key.
   */
  protected _cleanKey(key: string): string {
    const prefix = this._getOption('name');
    return `${prefix}:${key}`;
  }
}

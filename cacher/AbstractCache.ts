import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';
import type {
  AbstractCacherOptions,
  CacheSettings,
  CacheValue,
} from './types/mod.ts';
import { Cacher } from './Cacher.ts';

export abstract class AbstractCache<
  O extends AbstractCacherOptions = AbstractCacherOptions,
> extends Options<O> {
  protected _name: string;
  protected _status: 'INIT' | 'READY' = 'INIT';
  /**
   * Creates a new AbstractCache instance.
   *
   * @param name - The name of the cache. Used to namespace keys.
   * @param options - The cache settings.
   */
  constructor(name: string, options: OptionKeys<O>) {
    super(options, { defaultExpiry: 10 * 60 } as Partial<O>);
    this._name = name;
    Cacher.register(name, this as unknown as AbstractCache);
  }

  /**
   * The name of the cache.
   */
  get name(): string {
    return this._name;
  }

  /**
   * The cache engine.
   */
  get engine(): string {
    return this._getOption('engine');
  }

  get status(): 'INIT' | 'READY' {
    return this._status;
  }
  /**
   * Checks if a key exists in the cache.
   *
   * @param key - The key to check.
   * @returns True if the key exists, false otherwise.
   */
  public async has(key: string): Promise<boolean> {
    this._getOption('engine');
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
      data: value,
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
    return (await this._get<T>(cleanedKey))?.data;
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

  //#region Protected Methods
  protected _cleanKey(key: string): string {
    return `${this._name}:${key}`;
  }
  //#region Abstract Methods
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
  //#endregion Abstract Methods

  //#endregion Protected Methods
}

import { type OptionKeys, Options } from '../options/mod.ts';
import type {
  CacherEvents,
  CacherOptions,
  CacheSettings,
  CacheValue,
} from './types/mod.ts';
import { Cacher } from './CacheManager.ts';
import { CacherBaseError } from './errors/mod.ts';

export abstract class AbstractCache<O extends CacherOptions = CacherOptions>
  extends Options<O, CacherEvents> {
  public readonly name: string;
  protected _status: 'INIT' | 'READY' = 'INIT';

  constructor(name: string, options: OptionKeys<O>) {
    super(options, { defaultExpiry: 10 * 60 } as Partial<O>);
    this.name = name.trim().toLowerCase();
    if (!Cacher.has(this.name)) {
      Cacher.create(this.name, options);
    }
    // Register cacher with CacheManager
    Cacher.register(name, this as unknown as AbstractCache);
  }

  get engine(): 'MEMORY' | 'REDIS' {
    return this._getOption('engine');
  }

  get status(): 'INIT' | 'READY' {
    return this._status;
  }

  async has(name: string): Promise<boolean> {
    try {
      await this._init();
      return await this._has(this._cleanKey(name));
    } catch (e) {
      if (e instanceof CacherBaseError) {
        throw e;
      } else {
        throw new CacherBaseError(
          'An error occurred while checking if key exists',
          { engine: this.engine, config: this.name },
          e,
        );
      }
    }
  }

  async get<T>(name: string): Promise<T | undefined> {
    try {
      await this._init();
      return (await this._get<T>(this._cleanKey(name)))?.data;
    } catch (e) {
      if (e instanceof CacherBaseError) {
        console.log('sdf');
        throw e;
      } else {
        throw new CacherBaseError(
          'An error occurred while fetching cached value',
          { engine: this.engine, config: this.name },
          e,
        );
      }
    }
  }

  async set<T>(name: string, value: T, options?: CacheSettings): Promise<void> {
    try {
      await this._init();
      const valObj: CacheValue = {
        data: value,
        expiry: options?.expiry ||
          this._getOption('defaultExpiry') as number,
        window: options?.window || false,
      };
      await this._set(this._cleanKey(name), valObj);
    } catch (e) {
      if (e instanceof CacherBaseError) {
        throw e;
      } else {
        throw new CacherBaseError(
          'An error occurred while setting a cache value',
          { engine: this.engine, config: this.name },
          e,
        );
      }
    }
  }

  async delete(name: string): Promise<void> {
    try {
      await this._init();
      await this._delete(this._cleanKey(name));
    } catch (e) {
      if (e instanceof CacherBaseError) {
        throw e;
      } else {
        throw new CacherBaseError(
          'An error occurred while deleting cached value',
          { engine: this.engine, config: this.name },
          e,
        );
      }
    }
  }

  async clear(): Promise<void> {
    try {
      await this._init();
      await this._clear();
    } catch (e) {
      if (e instanceof CacherBaseError) {
        throw e;
      } else {
        throw new CacherBaseError('An error occurred while clearing cache', {
          engine: this.engine,
          config: this.name,
        }, e);
      }
    }
  }

  //#region Protected Methods
  protected _cleanKey(key: string): string {
    return `${this.name}:${key}`;
  }

  //#region Abstract Methods
  protected abstract _init(): void | Promise<void>;

  protected abstract _has(key: string): boolean | Promise<boolean>;

  protected abstract _get<T>(
    key: string,
  ): Promise<CacheValue<T> | undefined> | CacheValue<T> | undefined;

  protected abstract _set(key: string, value: CacheValue): void | Promise<void>;

  protected abstract _delete(key: string): void | Promise<void>;

  protected abstract _clear(): void | Promise<void>;
  //#endregion Abstract Methods

  //#endregion Protected Methods
}

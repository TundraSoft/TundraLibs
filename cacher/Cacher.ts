import { Options } from '../options/mod.ts';

type BaseCacheOptions = {
  name: string;
  mode: 'MEMORY' | 'REDIS';
  defaultExpiry: number;
};

type CacheSettings = {
  expiry?: number;
  window?: boolean;
};

type CacheValue = Required<CacheSettings> & {
  value: unknown;
};

export abstract class BaseCacher<O extends BaseCacheOptions>
  extends Options<O> {
  constructor(options: Partial<O>) {
    super(options as O, { defaultExpiry: 0 } as O);
  }

  public has(key: string): boolean {
    key = this._cleanKey(key);
    return this._has(key);
  }

  public set<T>(key: string, value: T, cacheOptions?: CacheSettings): void {
    key = this._cleanKey(key);
    const valObj: CacheValue = {
      value,
      expiry: 0,
      window: false,
    };
    if (cacheOptions && cacheOptions.expiry) {
      valObj.expiry = cacheOptions.expiry;
    }
    if (cacheOptions && cacheOptions.window) {
      valObj.window = cacheOptions.window;
    }
    this._set(key, valObj);
  }

  public get<T>(key: string): T | undefined {
    if (!this.has(key)) {
      return undefined;
    }
    key = this._cleanKey(key);
    return this._get(key)?.value as T;
  }

  public delete(key: string): void {
    key = this._cleanKey(key);
    this._delete(key);
  }

  public clear(): void {
    this._clear();
  }

  protected abstract _has(key: string): boolean;
  protected abstract _set(key: string, value: CacheValue): void;
  protected abstract _get(key: string): CacheValue | undefined;
  protected abstract _delete(key: string): void;
  protected abstract _clear(): void;

  protected _cleanKey(key: string): string {
    const prefix = this._getOption('name');
    return `${prefix}:${key}`;
  }
}

type MemoryCacherOptions = BaseCacheOptions & {
  mode: 'MEMORY';
};

export class MemoryCacher<O extends MemoryCacherOptions> extends BaseCacher<O> {
  protected _cache: Map<string, CacheValue> = new Map();
  protected _expirtyTimers: Map<string, number> = new Map();

  constructor(options: Partial<O>) {
    super(options as O);
  }

  protected _has(key: string): boolean {
    return this._cache.has(key);
  }

  protected _set(key: string, value: CacheValue): void {
    this._cache.set(key, value);
    if (value.expiry > 0) {
      this._setExpiry(key, value.expiry);
    }
  }

  protected _get(key: string): CacheValue | undefined {
    const value = this._cache.get(key);
    if (value !== undefined) {
      if (value.expiry > 0 && value.window) {
        this._setExpiry(key, value.expiry);
      }
      return value;
    }
    return undefined;
  }

  protected _delete(key: string): void {
    if (this._expirtyTimers.has(key)) {
      clearTimeout(this._expirtyTimers.get(key)!);
    }
    this._expirtyTimers.delete(key);
    this._cache.delete(key);
  }

  protected _clear(): void {
    this._expirtyTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this._cache.clear();
    this._expirtyTimers.clear();
  }

  protected _setExpiry(key: string, expiry: number): void {
    if (this._expirtyTimers.has(key)) {
      clearTimeout(this._expirtyTimers.get(key)!);
      this._expirtyTimers.delete(key);
    }
    const timer = setTimeout(() => {
      this.delete(key);
    }, expiry * 1000);
    this._expirtyTimers.set(key, timer);
  }
}

import { RedisConnect } from '../dependencies.ts';
import type { Redis } from '../dependencies.ts';
export type RedisCacheOptions = BaseCacheOptions & {
  mode: 'REDIS';
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls: boolean;
};

export class RedisCacher<O extends RedisCacheOptions> extends BaseCacher<O> {
  protected _client!: Redis;
  constructor(options: Partial<O>) {
    super(options as O);
  }

  public has(key: string): boolean {
    return false;
  }

  public set<T>(key: string, value: T, cacheOptions?: CacheSettings): void {
    //
  }

  public get<T>(key: string): T | undefined {
    return undefined;
  }

  public delete(key: string): void {
    //
  }

  public clear(): void {
    //
  }

  protected async _init(): Promise<void> {
    // connect options
    this._client = await RedisConnect({
      hostname: this._getOption('host'),
      port: this._getOption('port'),
      password: this._getOption('password'),
      db: this._getOption('db'),
    });
  }
}

const a = new MemoryCacher({
  mode: 'MEMORY',
  defaultExpiry: 0,
  prefix: 'test',
});

a.set('asdf', 'adsf');
a.set('sdf', 1234, { expiry: 5, window: true });

console.log(a);

setTimeout(() => {
  console.log(a.get('asdf'));
  console.log(a);
}, 4000);

setTimeout(() => {
  console.log(a);
}, 6000);

setTimeout(() => {
  console.log(a);
}, 15000);

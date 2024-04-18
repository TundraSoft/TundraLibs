import { singleton } from '../utils/mod.ts';
import { AbstractCache } from './AbstractCache.ts';
import { MemoryCache, RedisCache } from './engines/mod.ts';
import type {
  CacherOptions,
  MemoryOptions,
  RedisOptions,
} from './types/mod.ts';
import {
  CacherDuplicateError,
  CacherNotFound,
  UnsupportedCacherError,
} from './errors/mod.ts';

@singleton
class CacheManager {
  protected _cacheConfigs: Map<string, CacherOptions> = new Map();
  protected _caches: Map<string, AbstractCache> = new Map();

  create(name: string, options: CacherOptions) {
    name = this._cleanName(name);
    if (!['MEMORY', 'REDIS'].includes(options.engine)) {
      throw new UnsupportedCacherError({
        engine: options.engine,
        config: name,
      });
    }
    if (this._cacheConfigs.has(name)) {
      if (
        JSON.stringify(this._cacheConfigs.get(name)) !== JSON.stringify(options)
      ) {
        throw new CacherDuplicateError({
          engine: options.engine,
          config: name,
        });
      }
    }
    this._cacheConfigs.set(name, options);
    return this;
  }

  get(name: string): AbstractCache {
    name = this._cleanName(name);
    if (this._cacheConfigs.has(name) === false) {
      throw new CacherNotFound({ config: name });
    }
    if (this._caches.has(name)) {
      return this._caches.get(name) as AbstractCache;
    }
    const config = this._cacheConfigs.get(name) as CacherOptions;
    switch (config.engine) {
      case 'MEMORY':
        return new MemoryCache(name, config as MemoryOptions);
      case 'REDIS':
        return new RedisCache(
          name,
          config as RedisOptions,
        ) as unknown as AbstractCache;
    }
  }

  has(name: string): boolean {
    return this._cacheConfigs.has(this._cleanName(name));
  }

  register(name: string, cache: AbstractCache) {
    this._caches.set(name, cache);
  }

  protected _cleanName(name: string): string {
    return name.trim().toLowerCase();
  }
}

export const Cacher = new CacheManager();

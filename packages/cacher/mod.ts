// Core classes — canonical implementation files.
export { AbstractEngine } from './AbstractEngine.ts';
export { Cacher, type EngineConstructor } from './Cacher.ts';

// Concrete engines — re-exported through the engines/ barrel.
export { MemCacher, MemoryCacher, RedisCacher } from './engines/mod.ts';

// Error surface — single re-export site at ./errors/mod.ts.
export {
  CacherEngineError,
  CacherEngineErrorCodes,
  CacherError,
} from './errors/mod.ts';

// Type surface — single re-export site spanning the package's
// types/ folder and each engine's types/ folder (funnelled through
// the engines/ barrel).
export type {
  MemCacherOptions,
  MemoryCacherOptions,
  RedisCacherOptions,
} from './engines/mod.ts';
export type { CacherEngineErrorCode, CacherErrorMeta } from './errors/mod.ts';
export type {
  CacherOptions,
  CacheValue,
  CacheValueOptions,
} from './types/mod.ts';

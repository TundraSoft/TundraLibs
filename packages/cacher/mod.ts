/**
 * @fileoverview `@tundralibs/cacher` entrypoint.
 *
 * Provides a unified cache abstraction over in-memory, Redis, and
 * Memcached backends behind the same `Cacher` manager API. The package
 * is designed for server runtimes and exposes the concrete engine
 * constructors and option types needed to wire a cache into an app.
 *
 * Browser and worker bundles should only use the in-memory engine when
 * the runtime supports equivalent process-local semantics; the networked
 * Redis / Memcached engines depend on server-side socket lifecycles.
 *
 * @module
 */

// Core classes — canonical implementation files.
export { AbstractEngine } from './AbstractEngine.ts';
export { Cacher } from './Cacher.ts';

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
  EngineConstructor,
} from './types/mod.ts';

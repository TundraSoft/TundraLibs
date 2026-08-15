/**
 * Error surface for `@tundralibs/cacher` — the base {@link CacherError},
 * the engine-level {@link CacherEngineError}, and its typed error codes.
 *
 * @module
 */
export { CacherError } from './Base.ts';
export { CacherEngineError, type CacherErrorMeta } from './EngineError.ts';
export {
  type CacherEngineErrorCode,
  CacherEngineErrorCodes,
} from './EngineErrorCodes.ts';

/**
 * Error surface for `@tundralibs/drivers` — the base {@link DriverError},
 * the {@link EngineError} raised by engines, and its typed error codes.
 *
 * @module
 */
export { DriverError } from './Base.ts';
export { EngineError, type EngineErrorMeta } from './EngineError.ts';
export { type EngineErrorCode, EngineErrorCodes } from './EngineErrorCodes.ts';

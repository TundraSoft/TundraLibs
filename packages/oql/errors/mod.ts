/**
 * Error surface for `@tundralibs/oql` — the base {@link OqlError}, its
 * typed error codes, and the dialect-unsupported error raised when a
 * query construct has no translation for the target dialect.
 *
 * @module
 */
export { OqlError, type OqlErrorMeta } from './Base.ts';
export { type OqlErrorCode, OqlErrorCodes } from './OqlErrorCodes.ts';
export { DialectUnsupportedError } from './DialectUnsupportedError.ts';

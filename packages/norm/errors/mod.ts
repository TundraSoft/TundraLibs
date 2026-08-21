/**
 * Error surface for `@tundralibs/norm` — the base {@link NormError} and
 * the typed subclasses for definition, validation, query, crypto, hook,
 * migration, advisory-lock, and unsupported-operation failures.
 *
 * @module
 */
export { NormError } from './Base.ts';
export type { NormErrorCode } from './NormErrorCodes.ts';
export {
  type AdvisoryLockErrorMeta,
  NormAdvisoryLockError,
} from './NormAdvisoryLockError.ts';
export { type CryptoErrorMeta, NormCryptoError } from './NormCryptoError.ts';
export {
  type DefinitionErrorMeta,
  type DefinitionIssue,
  NormDefinitionError,
} from './NormDefinitionError.ts';
export { type HookErrorMeta, NormHookError } from './NormHookError.ts';
export {
  type MigrationErrorMeta,
  NormMigrationError,
} from './NormMigrationError.ts';
export { NormQueryError, type QueryErrorMeta } from './NormQueryError.ts';
export {
  NormUnsupportedError,
  type UnsupportedErrorMeta,
} from './NormUnsupportedError.ts';
export {
  NormValidationError,
  type ValidationErrorMeta,
  type ValidationIssue,
} from './NormValidationError.ts';

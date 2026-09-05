/**
 * Error surface for `@tundralibs/pact` — the base {@link PactError} and
 * its typed error codes.
 *
 * @module
 */
export { PactError } from './Base.ts';
export {
  PACT_AUTH_FAILURE_CODES,
  type PactErrorCode,
  PactErrorCodes,
} from './PactErrorCodes.ts';

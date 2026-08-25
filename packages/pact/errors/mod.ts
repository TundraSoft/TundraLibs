/**
 * @fileoverview Error surface of `@tundralibs/pact`.
 *
 * @module
 */

export { PactError, type PactErrorMeta } from './Base.ts';
export { type PactErrorCode, PactErrorCodes } from './PactErrorCodes.ts';
export { PactDefinitionError } from './PactDefinitionError.ts';
export { PactDeniedError } from './PactDeniedError.ts';
export { PactOAuthError } from './PactOAuthError.ts';
export { PactTokenError } from './PactTokenError.ts';

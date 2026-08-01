/**
 * @fileoverview Error exports for `@tundralibs/pact`.
 *
 * @module
 */

export { PactError, type PactErrorMeta } from './Base.ts';
export { PactDefinitionError } from './DefinitionError.ts';
export { PactDeniedError } from './DeniedError.ts';
export { PactTokenError } from './TokenError.ts';
export { PactOAuthError } from './OAuthError.ts';
export { type PactErrorCode, PactErrorCodes } from './PactErrorCodes.ts';

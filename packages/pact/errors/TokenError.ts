/**
 * @fileoverview Token-rejection error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';

/**
 * Token rejected by PACT itself — today only `TOKEN_REVOKED` (the
 * `isRevoked` seam vetoed a signature-valid token). Signature/claim
 * failures propagate as crypt's `JWTError`, not this class.
 */
export class PactTokenError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends PactError<M> {}

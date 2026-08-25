/**
 * @fileoverview Token-rejection error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';

/**
 * Token rejected by Pact itself — `TOKEN_REVOKED` (the `isRevoked` seam or
 * a dead session/family), `TOKEN_TYPE_MISMATCH` (a refresh token presented
 * as an access token, or the reverse), or `REFRESH_REUSED` (a stale
 * generation replayed). `Pact.verify`/`Pact.refresh` catch these
 * internally (emitting `verifyFailed`) and resolve `null`; the class
 * surfaces on the event and for standalone use.
 */
export class PactTokenError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends PactError<M> {}

/**
 * @fileoverview OAuth-flow error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';

/**
 * An OAuth flow failed — state mismatch (`OAUTH_STATE_MISMATCH`), a failed
 * code exchange (`OAUTH_EXCHANGE_FAILED`), a failed profile fetch or
 * subject-less profile (`OAUTH_PROFILE_FAILED`), a rejected `id_token`
 * (`OAUTH_IDTOKEN_INVALID` — always fatal), or an unobtainable key set
 * under the `'REQUIRED'` policy (`OAUTH_JWKS_UNAVAILABLE`).
 */
export class PactOAuthError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends PactError<M> {}

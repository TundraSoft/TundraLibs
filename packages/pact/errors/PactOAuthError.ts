/**
 * @fileoverview OAuth protocol error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';

/**
 * OAuth protocol failure — state mismatch, a failed code → token exchange,
 * or a failed profile fetch. Carries the provider (and, for HTTP failures,
 * the status) on `context`.
 */
export class PactOAuthError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends PactError<M> {}

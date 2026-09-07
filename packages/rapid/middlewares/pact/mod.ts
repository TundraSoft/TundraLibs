/**
 * @fileoverview Barrel for the pact adapter
 * (`@tundralibs/rapid/middlewares/pact`) — opt-in and deliberately
 * separate from `./middlewares`, so importing the core middleware catalog
 * never pulls `@tundralibs/pact` in. One factory, two middlewares: see
 * {@link pactAuth}.
 *
 * @module
 */

export { pactAuth, type PactAuthMiddlewares } from './pactAuth.ts';
export {
  type PactAuthContextArg,
  type PactAuthOptions,
  type PactScheme,
} from './credentials.ts';
/** The shape `ctx.auth` holds after `authenticate` — re-exported for handlers. */
export type { PactAuthContext } from '@tundralibs/pact';

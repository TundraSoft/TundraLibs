/**
 * @fileoverview Boot-time guard for the `stateKey` option shipped
 * middlewares (`responseTimer`, `requestId`) offer: writing a
 * PER-INVOCATION value into `ctx.state[stateKey]` is safe under the
 * `CLONE`/`PROTOTYPE` state modes, but corrupts silently under `SHARE`
 * — every invocation reads and writes the SAME state object, so
 * concurrent invocations overwrite each other's duration/correlation-id
 * (a request's `x-response-time` state entry can belong to a DIFFERENT,
 * concurrent request by the time anything reads it). There is no write
 * pattern that makes per-invocation data safe in a bag every invocation
 * shares by design, so this is caught at boot rather than papered over
 * at the write site.
 *
 * @module
 */

import type { RapidMiddleware } from '../types/mod.ts';

/**
 * Metadata key marking a middleware as writing per-invocation data into
 * `ctx.state`. `Symbol.for` — stable across module copies (duplicated
 * trees in node_modules must agree).
 */
export const MIDDLEWARE_STATE_KEY: unique symbol = Symbol.for(
  'rapid.middleware.stateKey',
) as never;

/** Stamp `middleware` as writing per-invocation state (called by the factory that owns a `stateKey` option). */
export function markStateKeyUser(middleware: RapidMiddleware): RapidMiddleware {
  return Object.assign(middleware, { [MIDDLEWARE_STATE_KEY]: true });
}

/** Whether `middleware` writes per-invocation data into `ctx.state`. */
export function middlewareUsesStateKey(middleware: RapidMiddleware): boolean {
  return (middleware as unknown as Record<symbol, unknown>)[
    MIDDLEWARE_STATE_KEY
  ] === true;
}

/**
 * @fileoverview {@link RapidMiddleware} — the UNIVERSAL onion-middleware
 * signature: one registration, every transport.
 *
 * @module
 */

import type { RapidContext } from './Context.ts';
import type { RapidContextState } from './context/State.ts';

/**
 * Universal middleware — registered once via `app.use()`, runs on the
 * invocation cycle of EVERY transport. `ctx` is the discriminated
 * {@link RapidContext} union: narrow with an `if (ctx.type === 'HTTP')`
 * ladder where transport-specific behaviour is needed; everything
 * shared (`ctx.action`, `ctx.args`, `ctx.payload`, `ctx.response`,
 * `ctx.state`) needs no narrowing at all.
 *
 * Call `next()` exactly once to continue the chain, and RETURN or AWAIT
 * it — a fire-and-forget `void next()` lets the invocation finalize
 * before the handler settles (its later throw is logged, not disclosed).
 * Skipping `next()` short-circuits the invocation (on jobs this is
 * surfaced as a distinct skipped-by-middleware outcome, never a silent
 * "finished").
 *
 * NEVER call `ctx.respond()` — finalization is transport-owned; set
 * `ctx.response` (or, in handlers, return the payload) instead. An
 * early respond() freezes the context and the invocation surfaces as
 * a 500.
 */
export type RapidMiddleware<
  S extends RapidContextState = RapidContextState,
> = (ctx: RapidContext<S>, next: () => Promise<void>) => Promise<void>;

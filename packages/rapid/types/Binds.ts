/**
 * @fileoverview {@link RapidBinds} — the bind TUPLE that drives a
 * decorated method's parameter types.
 *
 * @module
 */

import type { RapidBinder } from './Binder.ts';

/**
 * Maps a parameter tuple `A` to the binder tuple that produces it —
 * `bind: [param('id'), payload(Schema)]` infers
 * `A = [string, Schema]`, so the DECORATED METHOD's parameters are
 * checked against the binds at the `@` site (arity overflow included;
 * see the decorator docs for the enforcement limits).
 */
export type RapidBinds<A extends readonly unknown[]> = {
  readonly [K in keyof A]: RapidBinder<A[K]>;
};

/**
 * @fileoverview {@link RapidContext} — the discriminated union of the
 * three transport contexts, the `ctx` every universal middleware
 * receives.
 *
 * @module
 */

import type { HTTPContext, JOBContext, SOCKETContext } from '../context/mod.ts';
import type { RapidContextState } from './context/State.ts';

/**
 * The union of all transport contexts, discriminated on `ctx.type` —
 * an `if (ctx.type === 'HTTP')` ladder narrows to the full
 * {@link HTTPContext} surface (and so on), which is how ONE middleware
 * serves every transport without casts.
 */
export type RapidContext<S extends RapidContextState = RapidContextState> =
  | HTTPContext<S>
  | JOBContext<S>
  | SOCKETContext<S>;

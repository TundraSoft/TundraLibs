/**
 * @fileoverview {@link RapidHTTPHandler} — the HTTP route handler signature.
 *
 * @module
 */

import type { HTTPContext } from '../context/mod.ts';
import type { RapidContextResponse } from './context/Response.ts';
import type { RapidContextState } from './context/State.ts';

/**
 * A phase-1 handler either SETS `ctx.response` (Oak-style) or RETURNS
 * the response payload (the return-value channel — applied only when
 * nothing was set). Same payload type, two entry points. `S` is the
 * app's state shape — `ctx.state` is typed accordingly.
 */
export type RapidHTTPHandler<S extends RapidContextState = RapidContextState> =
  (
    ctx: HTTPContext<S>,
  ) => RapidContextResponse | void | Promise<RapidContextResponse | void>;

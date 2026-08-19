/**
 * @fileoverview {@link RapidSOCKETHandler} — the websocket command
 * handler signature.
 *
 * @module
 */

import type { RapidContextResponse } from './context/Response.ts';
import type { SOCKETContext } from '../context/mod.ts';
import type { RapidContextState } from './context/State.ts';

/**
 * A socket command handler — one invocation per inbound frame. Same
 * dual channel as HTTP: SET `ctx.response` or RETURN the payload (the
 * return-value channel applies only when nothing was set). `S` is the
 * app's state shape.
 */
export type RapidSOCKETHandler<
  S extends RapidContextState = RapidContextState,
> = (
  ctx: SOCKETContext<S>,
) => RapidContextResponse | void | Promise<RapidContextResponse | void>;

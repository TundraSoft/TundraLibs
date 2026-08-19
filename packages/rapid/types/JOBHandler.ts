/**
 * @fileoverview {@link RapidJOBHandler} — the scheduled-job handler signature.
 *
 * @module
 */

import type { RapidContextResponse } from './context/Response.ts';
import type { RapidContextState } from './context/State.ts';
import type { JOBContext } from '../context/mod.ts';

/** `S` is the app's state shape — `ctx.state` is typed accordingly, matching {@link RapidHTTPHandler}/{@link RapidSOCKETHandler}. */
export type RapidJOBHandler<S extends RapidContextState = RapidContextState> = (
  ctx: JOBContext<S>,
) => RapidContextResponse | void | Promise<RapidContextResponse | void>;

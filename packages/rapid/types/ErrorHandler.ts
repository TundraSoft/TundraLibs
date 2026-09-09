/**
 * @fileoverview {@link RapidErrorHandler} — the per-request error hook
 * registered with `app.onError`.
 *
 * @module
 */

import type { RapidError } from '../errors/mod.ts';
import type { RapidContext } from './Context.ts';
import type { RapidContextResponse } from './context/Response.ts';
import type { RapidContextState } from './context/State.ts';

/**
 * A per-request error hook (registered with `app.onError`). During
 * disclosure — after any throw from the onion is normalized to a
 * {@link RapidError} and logged — this runs inside the invocation's ambient
 * scope. Return a {@link RapidContextResponse} to OVERRIDE the default error
 * envelope (remap the status, add fields, theme the body); return nothing to
 * keep the default. It fires for every disclosed error on every transport.
 *
 * MUST be synchronous — the disclosure path is sync-through, so a returned
 * promise is not awaited. It also must not need to throw: a throw is logged
 * and the default envelope is used, so disclosure can never fail because of
 * the hook. One hook per application; the last `onError` call wins.
 */
export type RapidErrorHandler<S extends RapidContextState = RapidContextState> =
  (
    error: RapidError,
    ctx: RapidContext<S>,
  ) => RapidContextResponse | void;

/**
 * @fileoverview {@link RapidHTTPMiddleware} — HTTP-pipeline middleware
 * (app-level or route-scoped).
 *
 * @module
 */

import type { HTTPContext } from '../context/mod.ts';
import type { RapidContextState } from './context/State.ts';

/**
 * HTTP-pipeline middleware (route-scoped chains). Typed at the base
 * state so a middleware is reusable across apps; `ctx.state` is the
 * untyped bag here — the app's typed `S` surfaces in the HANDLER
 * ({@link RapidHTTPHandler}), which is where per-app state is read.
 * A universal {@link RapidMiddleware} is assignable wherever this type
 * is expected (it accepts the wider context union).
 */
export type RapidHTTPMiddleware = (
  ctx: HTTPContext<RapidContextState>,
  next: () => Promise<void>,
) => Promise<void>;

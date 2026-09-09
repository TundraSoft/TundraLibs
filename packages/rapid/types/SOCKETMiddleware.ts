/**
 * @fileoverview {@link RapidSOCKETMiddleware} — socket-pipeline
 * middleware (command-scoped chains).
 *
 * @module
 */

import type { SOCKETContext } from '../context/mod.ts';
import type { RapidContextState } from './context/State.ts';

/**
 * Socket-pipeline middleware (per-command chains registered via
 * `app.socket(command, ...chain, handler)`). Typed at the base state
 * so a middleware is reusable across apps; the app's typed `S`
 * surfaces in the HANDLER ({@link RapidSOCKETHandler}). A universal
 * {@link RapidMiddleware} is assignable wherever this type is
 * expected (it accepts the wider context union).
 */
export type RapidSOCKETMiddleware = (
  ctx: SOCKETContext<RapidContextState>,
  next: () => Promise<void>,
) => Promise<void>;

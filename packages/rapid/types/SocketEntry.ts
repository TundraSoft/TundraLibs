/**
 * @fileoverview {@link RapidSocketEntry} — a registered websocket command —
 * stored by the app, consumed by the HTTP transport's upgrade path.
 *
 * @module
 */

import type { RapidSOCKETHandler } from './SOCKETHandler.ts';
import type { RapidSOCKETMiddleware } from './SOCKETMiddleware.ts';
import type { RapidContextState } from './context/State.ts';

/** A registered websocket command. */
export type RapidSocketEntry<S extends RapidContextState = RapidContextState> =
  {
    /** The command name clients invoke (`{ command: '...' }` frames). */
    command: string;
    /** Command-scoped middleware, run AFTER the universal chain. */
    middlewares: RapidSOCKETMiddleware[];
    handler: RapidSOCKETHandler<S>;
  };

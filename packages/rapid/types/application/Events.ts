/**
 * @fileoverview {@link RapidApplicationEvents} — application lifecycle events.
 *
 * @module
 */

import { RapidError } from '../../errors/mod.ts';

/** The application lifecycle events, listenable through the app's `Events` surface. */
export type RapidApplicationEvents = {
  /** Fired once every transport has started. */
  start: () => void;
  /** Fired once every transport has stopped and modules are disposed. */
  stop: () => void;
  /** Fired with the {@link RapidError} when startup fails. */
  error: (error: RapidError) => void;
};

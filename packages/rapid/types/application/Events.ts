/**
 * @fileoverview {@link RapidApplicationEvents} — application lifecycle events.
 *
 * @module
 */

import { RapidError } from '../../errors/mod.ts';

export type RapidApplicationEvents = {
  start: () => void;
  stop: () => void;
  error: (error: RapidError) => void;
};

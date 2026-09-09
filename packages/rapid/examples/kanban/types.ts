/**
 * Domain types for the Flightdeck board. Plain data — the store owns the
 * behavior, the views own the markup.
 *
 * @module
 */

/** Board lanes, in travel order — `move()` walks this array. */
export const LANES = ['todo', 'doing', 'review', 'done'] as const;

/** One lane name. */
export type Lane = (typeof LANES)[number];

/** One card on the board. */
export type Task = {
  id: string;
  title: string;
  owner: string;
  tag: 'bug' | 'feature' | 'ops';
  lane: Lane;
  updatedAt: string;
};

/** One activity-feed row (newest first in the store). */
export type Activity = {
  at: string;
  text: string;
};

/**
 * @fileoverview {@link SpanEvent} — a timestamped annotation on a span.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { Attributes } from './Attributes.ts';

/**
 * A timestamped point-in-time annotation within a span — "this happened at
 * this moment", as opposed to a child span's "this took this long".
 */
export type SpanEvent = {
  /** Event name, e.g. `exception` or `cache.miss`. */
  name: string;
  /** When the event occurred. */
  time: Date;
  /** Structured detail for the event. */
  attributes: Attributes;
};

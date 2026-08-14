/**
 * @fileoverview Built-in {@link Sampler}s.
 *
 * Sampling here is **head-based**: the decision is made once, when the span is
 * created, before anything about its outcome is known. A sampler is only ever
 * consulted for **root** spans — child spans inherit the parent's decision, so
 * a trace is always sampled whole or not at all (a partially-sampled trace
 * renders as a waterfall with holes in it).
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { ratioSampler, Tracer } from '@tundralibs/tracer';
 *
 * new Tracer({ serviceName: 'orders', sampler: ratioSampler(0.1) }); // 10%
 * ```
 */

import type { Sampler } from './types/mod.ts';

/** Record every span. The default. */
export const alwaysOnSampler: Sampler = (): boolean => true;

/** Record nothing — spans still propagate ids, but are never exported. */
export const alwaysOffSampler: Sampler = (): boolean => false;

/** Number of distinct values in the 32-bit window read from the trace id. */
const ID_WINDOW = 2 ** 32;

/**
 * Sample a deterministic fraction of traces.
 *
 * The decision derives from the trace id itself — never from a random draw —
 * so every service in a distributed system that uses the same ratio reaches the
 * *same* verdict for a given trace. That is what keeps a sampled trace complete
 * end-to-end instead of fragmenting across service boundaries.
 *
 * @param ratio - Fraction to sample, `0` to `1`. Values at or below `0` select
 *   {@link alwaysOffSampler}; at or above `1`, {@link alwaysOnSampler}.
 * @returns A deterministic {@link Sampler}.
 */
export function ratioSampler(ratio: number): Sampler {
  // NaN is checked explicitly: `NaN <= 0` is false, so a comparison alone would
  // let it through and produce a sampler that never fires predictably.
  if (Number.isNaN(ratio) || ratio <= 0) return alwaysOffSampler;
  if (ratio >= 1) return alwaysOnSampler;
  const threshold = Math.floor(ratio * ID_WINDOW);
  return ({ traceId }) => Number.parseInt(traceId.slice(-8), 16) < threshold;
}

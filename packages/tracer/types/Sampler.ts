/**
 * @fileoverview {@link Sampler} — the head-based decision of whether to record
 * a span.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { SamplingInput } from './SamplingInput.ts';

/**
 * Decides whether a span is recorded and exported. Called once per span, at
 * creation ("head-based" sampling).
 *
 * A sampler must be **deterministic for a given trace id** — otherwise one
 * trace ends up partially sampled, producing broken waterfalls with missing
 * middles. The built-in `ratioSampler` satisfies this by deriving its decision
 * from the trace id itself rather than from a random draw per span.
 *
 * @param input - See {@link SamplingInput}.
 * @returns `true` to record and export the span, `false` to drop it.
 */
export type Sampler = (input: SamplingInput) => boolean;

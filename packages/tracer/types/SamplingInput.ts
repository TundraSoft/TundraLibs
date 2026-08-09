/**
 * @fileoverview {@link SamplingInput} — everything a {@link Sampler} sees when
 * deciding whether to record a span.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { Attributes } from './Attributes.ts';
import type { SpanContext } from './SpanContext.ts';
import type { SpanKind } from './SpanKind.ts';

/**
 * The information available to a sampler at span-creation time. Note there is
 * no duration or status — sampling here is **head-based** (decided up front),
 * so nothing about the span's outcome is knowable yet.
 */
export type SamplingInput = {
  /** The trace this span would belong to. */
  traceId: string;
  /** The span's operation name. */
  name: string;
  /** The span's role. */
  kind: SpanKind;
  /** Attributes supplied at creation. */
  attributes: Attributes;
  /** The resolved parent context, when this span is not a trace root. */
  parent?: SpanContext;
};

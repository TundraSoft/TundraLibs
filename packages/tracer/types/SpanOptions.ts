/**
 * @fileoverview {@link SpanOptions} — per-span creation options.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { Attributes } from './Attributes.ts';
import type { SpanContext } from './SpanContext.ts';
import type { SpanKind } from './SpanKind.ts';

/** Options accepted when starting a span. */
export type SpanOptions = {
  /** The span's role. Defaults to {@link SpanKind.INTERNAL}. */
  kind?: SpanKind;
  /**
   * Explicit parent context — typically one {@link SpanContext} extracted from
   * an inbound `traceparent`. When omitted the parent is the currently active
   * span (via `ambient`); when there is none, the span starts a new trace.
   *
   * Pass `null` to force a new root trace even inside an active span.
   */
  parent?: SpanContext | null;
  /** Attributes to set at creation — visible to the sampler. */
  attributes?: Attributes;
  /** Explicit start time. Defaults to now. */
  startTime?: Date;
};

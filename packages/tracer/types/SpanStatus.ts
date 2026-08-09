/**
 * @fileoverview {@link SpanStatus} — a span's outcome plus an optional
 * description.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { SpanStatusCode } from './SpanStatusCode.ts';

/** A span's outcome — see {@link SpanStatusCode}. */
export type SpanStatus = {
  /** The outcome code. */
  code: SpanStatusCode;
  /**
   * Human-readable description. Per the OTLP spec this is only meaningful
   * when `code` is `ERROR`, and is ignored otherwise.
   */
  message?: string;
};

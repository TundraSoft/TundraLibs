/**
 * @fileoverview {@link SpanData} — the immutable snapshot of a finished span
 * handed to exporters.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { Attributes } from './Attributes.ts';
import type { SpanContext } from './SpanContext.ts';
import type { SpanEvent } from './SpanEvent.ts';
import type { SpanKind } from './SpanKind.ts';
import type { SpanStatus } from './SpanStatus.ts';

/**
 * A finished span, flattened into plain data for export. Exporters receive
 * these rather than live `Span` instances, so a slow or async exporter can
 * never observe (or mutate) a span that is still being written to.
 */
export type SpanData = {
  /** Operation name, e.g. `GET /orders/:id`. */
  name: string;
  /** This span's propagated identity. */
  context: SpanContext;
  /** Parent span id within the same trace; absent when this is the root. */
  parentSpanId?: string;
  /** The span's role — see {@link SpanKind}. */
  kind: SpanKind;
  /** When the span started. */
  startTime: Date;
  /** When the span ended. */
  endTime: Date;
  /** Attributes accumulated over the span's lifetime. */
  attributes: Attributes;
  /** Timestamped events recorded on the span, in insertion order. */
  events: SpanEvent[];
  /** The span's outcome. */
  status: SpanStatus;
  /** `service.name` and any other resource-level attributes. */
  resource: Attributes;
};

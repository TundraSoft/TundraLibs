/**
 * @fileoverview The {@link Span} — one unit of work in a trace.
 *
 * A span is mutable while open (attributes, events, status) and becomes an
 * immutable {@link SpanData} snapshot when {@link Span.end} is called.
 *
 * Spans are created by {@link Tracer}, never constructed directly by callers.
 *
 * @author TundraSoft
 *
 * @module
 */

import type {
  Attributes,
  AttributeValue,
  SpanContext,
  SpanData,
  SpanEvent,
  SpanKind,
  SpanStatus,
} from './types/mod.ts';
import { SpanStatusCode } from './types/mod.ts';

/** Constructor arguments for a {@link Span}. Internal to the package. */
export type SpanInit = {
  name: string;
  context: SpanContext;
  kind: SpanKind;
  startTime: Date;
  parentSpanId?: string;
  attributes?: Attributes;
  resource: Attributes;
  /** `false` when sampling dropped this span — mutations become no-ops. */
  recording: boolean;
  /** Called once, on `end()`, only for recording spans. */
  onEnd: (data: SpanData) => void;
};

/**
 * One unit of work within a trace: a name, a start and end time, a parent, and
 * whatever attributes and events were recorded on it.
 *
 * **Nothing on a span throws.** Tracing is observability; it must never be able
 * to break the code it observes. Writes after `end()`, or on a span that
 * sampling dropped, are silently ignored.
 */
export class Span {
  /** Operation name, e.g. `GET /orders/:id`. */
  public readonly name: string;
  /** This span's propagated identity — pass to `inject()` for outbound calls. */
  public readonly context: SpanContext;
  /** The span's role in the trace. */
  public readonly kind: SpanKind;
  /** Parent span id within the same trace; absent when this is the root. */
  public readonly parentSpanId?: string;
  /** When the span started. */
  public readonly startTime: Date;

  private readonly __resource: Attributes;
  private readonly __onEnd: (data: SpanData) => void;
  private readonly __recording: boolean;
  private readonly __attributes: Attributes;
  private readonly __events: SpanEvent[] = [];
  private __status: SpanStatus = { code: SpanStatusCode.UNSET };
  private __endTime?: Date;

  /**
   * @param init - See {@link SpanInit}. Created by {@link Tracer}, not callers.
   */
  constructor(init: SpanInit) {
    this.name = init.name;
    this.context = init.context;
    this.kind = init.kind;
    this.startTime = init.startTime;
    this.parentSpanId = init.parentSpanId;
    this.__resource = init.resource;
    this.__recording = init.recording;
    this.__onEnd = init.onEnd;
    this.__attributes = { ...init.attributes };
  }

  /**
   * Whether this span is still collecting data — i.e. it was sampled and has
   * not ended. Use it to skip building expensive attribute values.
   */
  public isRecording(): boolean {
    return this.__recording && this.__endTime === undefined;
  }

  /**
   * Set one attribute. `null`/`undefined` values are dropped — OTLP has no
   * encoding for them, and emitting one invalidates the whole payload.
   *
   * @param key - Attribute name; prefer OpenTelemetry semantic conventions.
   * @param value - See {@link AttributeValue}.
   * @returns `this`, for chaining.
   */
  public setAttribute(key: string, value: AttributeValue): this {
    if (!this.isRecording()) return this;
    if (value === null || value === undefined) return this;
    this.__attributes[key] = value;
    return this;
  }

  /**
   * Set several attributes at once. See {@link Span.setAttribute}.
   *
   * @param attributes - Attributes to merge in.
   * @returns `this`, for chaining.
   */
  public setAttributes(attributes: Attributes): this {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }
    return this;
  }

  /**
   * Record a timestamped event on this span.
   *
   * @param name - Event name, e.g. `cache.miss`.
   * @param attributes - Structured detail for the event.
   * @param time - When it happened. Defaults to now.
   * @returns `this`, for chaining.
   */
  public addEvent(
    name: string,
    attributes: Attributes = {},
    time: Date = new Date(),
  ): this {
    if (!this.isRecording()) return this;
    this.__events.push({ name, time, attributes });
    return this;
  }

  /**
   * Set the span's outcome. `message` is only meaningful for
   * {@link SpanStatusCode.ERROR}.
   *
   * @param code - The outcome.
   * @param message - Description, for errors.
   * @returns `this`, for chaining.
   */
  public setStatus(code: SpanStatusCode, message?: string): this {
    if (!this.isRecording()) return this;
    this.__status = message === undefined ? { code } : { code, message };
    return this;
  }

  /**
   * Record an exception as an `exception` event, using the OpenTelemetry
   * semantic-convention attribute names so backends render it as an error.
   *
   * This records the exception but does **not** set the span status — a caught
   * and handled exception is not necessarily a failed operation. Call
   * {@link Span.setStatus} explicitly when it is.
   *
   * @param error - The thrown value. Non-`Error` values are stringified.
   * @returns `this`, for chaining.
   */
  public recordException(error: unknown): this {
    if (!this.isRecording()) return this;
    const attributes: Attributes = error instanceof Error
      ? {
        'exception.type': error.name,
        'exception.message': error.message,
        ...(error.stack === undefined
          ? {}
          : { 'exception.stacktrace': error.stack }),
      }
      : { 'exception.message': String(error) };
    return this.addEvent('exception', attributes);
  }

  /**
   * End the span and hand it to the exporter. Idempotent — a second call is
   * ignored, so a `finally { span.end() }` is always safe.
   *
   * @param endTime - Explicit end time. Defaults to now.
   */
  public end(endTime: Date = new Date()): void {
    if (this.__endTime !== undefined) return;
    this.__endTime = endTime;
    if (!this.__recording) return;
    this.__onEnd(this.toData());
  }

  /**
   * Immutable snapshot of this span for export. Exporters receive one of these
   * rather than the live span, so nothing downstream can mutate trace state.
   *
   * @returns The {@link SpanData} snapshot.
   */
  public toData(): SpanData {
    return {
      name: this.name,
      context: { ...this.context },
      parentSpanId: this.parentSpanId,
      kind: this.kind,
      startTime: this.startTime,
      endTime: this.__endTime ?? new Date(),
      attributes: { ...this.__attributes },
      events: [...this.__events],
      status: { ...this.__status },
      resource: { ...this.__resource },
    };
  }
}

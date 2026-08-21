/**
 * @fileoverview `Meter` — the per-invocation metrics recorder, a thin
 * wrapper over `@tundralibs/metro-man`. Created only when
 * `server.metrics` is on (so it costs nothing otherwise), it counts
 * invocations, times them into a latency histogram, and tracks in-flight
 * per transport. Exposed as `app.meter` / `ctx.meter`; the `metrics()`
 * endpoint serves `collect(...)`.
 *
 * @module
 */

import {
  type Counter,
  type Gauge,
  type Histogram,
  MetroMan,
} from '@tundralibs/metro-man';

/** What {@link Meter.end} needs to close out an invocation. */
export type MeterSample = {
  transport: string;
  action: string;
  status: number;
  start: number;
};

/**
 * Records request/invocation metrics. Labels stay low-cardinality —
 * `transport`, the route/command/job `action` (a pattern, not a raw
 * path), and the `2xx/3xx/4xx/5xx` status class.
 */
export class Meter {
  /** The underlying registry — `collect('PROMETHEUS' | 'JSON')`. */
  public readonly registry: MetroMan = new MetroMan();
  private readonly __requests: Counter;
  private readonly __latency: Histogram;
  private readonly __inflight: Gauge;
  private readonly __errors: Counter;

  constructor() {
    this.__requests = this.registry.counter({
      name: 'rapid_requests_total',
      help: 'Invocations by transport, action and status class.',
    });
    this.__latency = this.registry.histogram({
      name: 'rapid_request_duration_ms',
      help: 'Invocation latency in milliseconds.',
    });
    this.__inflight = this.registry.gauge({
      name: 'rapid_requests_in_flight',
      help: 'Invocations currently executing, by transport.',
    });
    this.__errors = this.registry.counter({
      name: 'rapid_errors_total',
      help: '5xx invocations by transport and action.',
    });
  }

  /** Mark an invocation started; returns the start timestamp for {@link end}. */
  public begin(transport: string): number {
    this.__inflight.inc({ transport });
    return performance.now();
  }

  /** Record a finished invocation. */
  public end(sample: MeterSample): void {
    const { transport, action, status, start } = sample;
    this.__inflight.dec({ transport });
    const statusClass = `${Math.floor(status / 100)}xx`;
    this.__requests.inc({ transport, action, status: statusClass });
    this.__latency.observe(performance.now() - start, { transport, action });
    if (status >= 500) this.__errors.inc({ transport, action });
  }

  /** Serialize every metric — `'PROMETHEUS'` text or a `'JSON'` object. */
  public collect(format: 'PROMETHEUS'): string;
  public collect(format: 'JSON'): Record<string, unknown>;
  public collect(
    format: 'PROMETHEUS' | 'JSON',
  ): string | Record<string, unknown> {
    return format === 'PROMETHEUS'
      ? this.registry.collect('PROMETHEUS')
      : this.registry.collect('JSON');
  }
}

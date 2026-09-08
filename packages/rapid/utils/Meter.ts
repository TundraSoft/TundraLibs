/**
 * @fileoverview `Meter` — the app's metrics recorder, a thin wrapper over
 * `@tundralibs/metro-man`. Created only when `server.metrics` is on (so
 * it costs nothing otherwise); each metric FAMILY is switchable and a
 * family that is off declares no series and turns its recorder into one
 * boolean check. Exposed as `app.meter` / `ctx.meter`; the `metrics()`
 * endpoint serves `collect(...)`; apps register their own metrics on
 * `meter.registry`.
 *
 * @module
 */
import {
  type Counter,
  type Gauge,
  type Histogram,
  MetroMan,
} from '@tundralibs/metro-man';
import type { RapidApplicationMetricsOptions } from '../types/application/MetricsOptions.ts';

/** What {@link Meter.end} needs to close out an invocation. */
export type MeterSample = {
  transport: string;
  action: string;
  status: number;
  start: number;
};

/** One job run's outcome, as {@link Meter.job} records it. */
export type MeterJobSample = {
  job: string;
  outcome: 'ok' | 'failed' | 'skipped' | 'overlap';
  /** Handler wall time in milliseconds (absent for an `overlap` skip). */
  durationMs?: number;
  /** Scheduled → fired in milliseconds. */
  driftMs?: number;
};

/** The resolved family switches. */
export type MeterFamilies = Readonly<Required<RapidApplicationMetricsOptions>>;

/** Request latency, milliseconds — sub-millisecond to ten seconds. */
const LATENCY_BUCKETS_MS = [
  1,
  2.5,
  5,
  10,
  25,
  50,
  100,
  250,
  500,
  1000,
  2500,
  5000,
  10000,
];
/** Job wall time, milliseconds — jobs run longer than requests. */
const JOB_BUCKETS_MS = [10, 50, 100, 500, 1000, 5000, 15000, 60000, 300000];
/** Scheduler drift, milliseconds. */
const DRIFT_BUCKETS_MS = [1, 10, 100, 1000, 5000, 60000];

/**
 * The `action` label for a context: the route / command / job pattern,
 * or `<method> <unmatched>` for an HTTP request no route matched — its
 * `action` is then the raw pathname, which must never become a label.
 */
export function meterAction(
  ctx: { type: string; action: string; matched?: boolean },
): string {
  if (ctx.type === 'HTTP' && ctx.matched === false) {
    const sp = ctx.action.indexOf(' ');
    const method = sp === -1 ? ctx.action : ctx.action.slice(0, sp);
    return `${method} <unmatched>`;
  }
  return ctx.action;
}

/**
 * Records framework metrics into a metro-man registry. Every recorder is
 * a no-op for a family that is off. Labels stay low-cardinality:
 * `transport`, the route/command/job pattern `action`, the `2xx..5xx`
 * status class, a registered error `code`, a job or channel name.
 */
export class Meter {
  /** The underlying registry — `collect('PROMETHEUS' | 'JSON')`; register app metrics here. */
  public readonly registry: MetroMan = new MetroMan();
  /** Which families this meter records. */
  public readonly families: MeterFamilies;

  private readonly __requests?: Counter;
  private readonly __latency?: Histogram;
  private readonly __inflight?: Gauge;
  private readonly __errors?: Counter;
  private readonly __codes?: Counter;
  private readonly __jobRuns?: Counter;
  private readonly __jobDuration?: Histogram;
  private readonly __jobDrift?: Histogram;
  private readonly __upgrades?: Counter;
  private readonly __subscriptions?: Counter;
  private readonly __publishes?: Counter;
  private readonly __middleware?: Counter;
  private readonly __requestBytes?: Counter;
  private readonly __uploads?: Counter;
  private readonly __representations?: Counter;
  private readonly __static?: Counter;

  /** Build a meter; every family defaults to on. */
  constructor(options: RapidApplicationMetricsOptions = {}) {
    this.families = Object.freeze({
      requests: options.requests !== false,
      errors: options.errors !== false,
      jobs: options.jobs !== false,
      sockets: options.sockets !== false,
      middleware: options.middleware !== false,
      bodies: options.bodies !== false,
      ui: options.ui !== false,
    });
    const r = this.registry;
    if (this.families.requests) {
      this.__requests = r.counter({
        name: 'rapid_requests_total',
        help: 'Invocations by transport, action and status class.',
      });
      this.__latency = r.histogram({
        name: 'rapid_request_duration_ms',
        help: 'Invocation latency in milliseconds, arrival to send.',
        buckets: LATENCY_BUCKETS_MS,
      });
      this.__inflight = r.gauge({
        name: 'rapid_requests_in_flight',
        help: 'Invocations currently executing, by transport.',
      });
      this.__errors = r.counter({
        name: 'rapid_errors_total',
        help: '5xx invocations by transport and action.',
      });
    }
    if (this.families.errors) {
      this.__codes = r.counter({
        name: 'rapid_error_codes_total',
        help: 'Disclosed errors by registered code and transport.',
      });
    }
    if (this.families.jobs) {
      this.__jobRuns = r.counter({
        name: 'rapid_job_runs_total',
        help: 'Job runs by name and outcome (ok, failed, skipped, overlap).',
      });
      this.__jobDuration = r.histogram({
        name: 'rapid_job_duration_ms',
        help: 'Job wall time in milliseconds.',
        buckets: JOB_BUCKETS_MS,
      });
      this.__jobDrift = r.histogram({
        name: 'rapid_job_drift_ms',
        help: 'Scheduled-to-fired drift in milliseconds.',
        buckets: DRIFT_BUCKETS_MS,
      });
    }
    if (this.families.sockets) {
      this.__upgrades = r.counter({
        name: 'rapid_socket_upgrades_total',
        help: 'Websocket upgrades by result (accepted, refused).',
      });
      this.__subscriptions = r.counter({
        name: 'rapid_channel_subscriptions_total',
        help: 'Channel subscriptions by channel and event.',
      });
      this.__publishes = r.counter({
        name: 'rapid_channel_publishes_total',
        help: 'Server-initiated publishes by channel.',
      });
    }
    if (this.families.middleware) {
      this.__middleware = r.counter({
        name: 'rapid_middleware_events_total',
        help: 'Decisions taken by the shipped middleware, by action.',
      });
    }
    if (this.families.bodies) {
      this.__requestBytes = r.counter({
        name: 'rapid_request_bytes_total',
        help: 'Request body bytes read, by transport.',
      });
      this.__uploads = r.counter({
        name: 'rapid_uploads_total',
        help: 'Uploaded file parts written to disk.',
      });
    }
    if (this.families.ui) {
      this.__representations = r.counter({
        name: 'rapid_representations_total',
        help: 'Templated replies by representation kind.',
      });
      this.__static = r.counter({
        name: 'rapid_static_requests_total',
        help:
          'Static file requests by event (hit, not_modified, range, unsatisfiable, miss).',
      });
    }
  }

  /**
   * Mark an invocation started; returns the clock {@link end} measures
   * from. Pass the transport's own arrival stamp (`performance.now()`
   * based) so the histogram, the `x-response-time` header and the access
   * line agree.
   */
  public begin(transport: string, started?: number): number {
    this.__inflight?.inc({ transport });
    return started ?? performance.now();
  }

  /** Record a finished invocation. */
  public end(sample: MeterSample): void {
    if (this.__requests === undefined) return;
    const { transport, action, status, start } = sample;
    this.__inflight!.dec({ transport });
    const statusClass = `${Math.floor(status / 100)}xx`;
    this.__requests.inc({ transport, action, status: statusClass });
    this.__latency!.observe(performance.now() - start, { transport, action });
    if (status >= 500) this.__errors!.inc({ transport, action });
  }

  /** Record a disclosed error by its registered code. */
  public error(code: string, transport: string): void {
    this.__codes?.inc({ code, transport });
  }

  /** Record a job run (or an `overlap` skip, which has no duration). */
  public job(sample: MeterJobSample): void {
    if (this.__jobRuns === undefined) return;
    const { job, outcome } = sample;
    this.__jobRuns.inc({ job, outcome });
    if (sample.durationMs !== undefined) {
      this.__jobDuration!.observe(sample.durationMs, { job });
    }
    if (sample.driftMs !== undefined) {
      this.__jobDrift!.observe(sample.driftMs, { job });
    }
  }

  /** Record a websocket upgrade decision. */
  public upgrade(result: 'accepted' | 'refused'): void {
    this.__upgrades?.inc({ result });
  }

  /** Record a channel subscription event. */
  public subscription(
    channel: string,
    event: 'subscribed' | 'unsubscribed' | 'refused',
  ): void {
    this.__subscriptions?.inc({ channel, event });
  }

  /** Record a server-initiated publish. */
  public published(channel: string): void {
    this.__publishes?.inc({ channel });
  }

  /** Record a decision a shipped middleware took (`action` from {@link meterAction}). */
  public middleware(name: string, event: string, action: string): void {
    this.__middleware?.inc({ middleware: name, event, action });
  }

  /** Add request body bytes actually read. */
  public requestBytes(transport: string, bytes: number): void {
    if (bytes > 0) this.__requestBytes?.inc(bytes, { transport });
  }

  /** Add uploaded file parts written. */
  public uploads(count: number): void {
    if (count > 0) this.__uploads?.inc(count);
  }

  /** Record how a templated reply was represented. */
  public representation(kind: 'json' | 'fragment' | 'page' | 'redirect'): void {
    this.__representations?.inc({ kind });
  }

  /** Record a static-file outcome. */
  public static(
    event: 'hit' | 'not_modified' | 'range' | 'unsatisfiable' | 'miss',
  ): void {
    this.__static?.inc({ event });
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

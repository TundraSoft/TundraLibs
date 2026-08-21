/**
 * @fileoverview `metrics()` — a mountable endpoint that serves the app's
 * metrics (`app.meter`) as Prometheus text or JSON. Mount where you like:
 * `app.get('/metrics', metrics())`. Returns 503 when `server.metrics` is
 * off (nothing is being collected).
 *
 * @module
 */
import type { RapidHTTPHandler } from '../types/mod.ts';

/** Options for {@link metrics}. */
export type MetricsOptions = {
  /** @default 'prometheus' */
  format?: 'prometheus' | 'json';
};

/** An endpoint handler serving `app.meter.collect(...)`. */
export function metrics(options: MetricsOptions = {}): RapidHTTPHandler {
  const format = options.format ?? 'prometheus';
  return (ctx) => {
    const meter = ctx.meter;
    if (meter === undefined) {
      return {
        status: 503,
        content: {
          code: 'RAPID_METRICS_DISABLED',
          message: 'set server.metrics to enable',
        },
      };
    }
    if (format === 'json') return { content: meter.collect('JSON') };
    return {
      content: meter.collect('PROMETHEUS'),
      headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
    };
  };
}

/**
 * @fileoverview Counter shape returned by `Server.metrics`. All times
 * in ms; counters persist until `resetMetrics()`.
 *
 * @module
 */

/**
 * Server performance and usage counters. Populated as requests and
 * WebSocket connections flow through; reset via `Server.resetMetrics()`.
 *
 * @example
 * ```typescript
 * const m = server.metrics;
 * console.log(m.requests.active, '/', m.requests.peakActive);
 * console.log('avg', m.responseTime.average, 'ms');
 * ```
 */
export type ServerMetrics = {
  requests: {
    /** Total received since last reset (success + failure). */
    total: number;
    /** Currently in-flight. */
    active: number;
    /** High-water mark for `active`. */
    peakActive: number;
  };

  /** Response counts bucketed by status-code class (1xx–5xx). */
  statusCodes: {
    '1xx': number;
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
  };

  /**
   * Request-receipt → response-flush latency, in ms. `min` starts at
   * `Infinity` and `max` at `0` until the first request lands.
   */
  responseTime: {
    min: number;
    max: number;
    average: number;
  };

  /** WebSocket counters. Populated only when a `websocket` handler is configured. */
  websocket: {
    /** All upgrade attempts, including failures. */
    upgrades: number;
    connections: {
      /** Established (counted on `open`) since last reset. */
      total: number;
      /** Currently open. */
      active: number;
      peakActive: number;
    };
    messages: {
      received: number;
      sent: number;
    };
    /** Counted from the `error` callback. */
    errors: number;
    /**
     * `open` → `close` duration in ms. Tracking requires an `open`
     * callback to be set (the wrapper installs one if the user
     * doesn't).
     */
    connectionDuration: {
      min: number;
      max: number;
      average: number;
    };
  };
};

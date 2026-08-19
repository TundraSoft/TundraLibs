/**
 * @fileoverview `responseTimer` — measure invocation duration and
 * EXPOSE it: an `x-response-time` header on HTTP, and optionally into
 * `ctx.state` on every transport (jobs pair it with `ctx.drift`).
 * Distinct from `requestLogger`, which only LOGS duration — this makes
 * it available to the client and to downstream middleware.
 *
 * @module
 */

import type { RapidMiddleware } from '../types/mod.ts';
import { markStateKeyUser } from './stateKeyGuard.ts';

/** Options for {@link responseTimer}. */
export type ResponseTimerOptions = {
  /**
   * HTTP response header carrying the duration.
   * @default 'x-response-time'
   */
  header?: string;
  /**
   * When set, the measured milliseconds are also written to
   * `ctx.state[stateKey]` on EVERY transport (numbers, not the
   * `"12ms"` header string).
   */
  stateKey?: string;
};

/**
 * Build the timer. The measurement covers everything INSIDE this
 * middleware (register it early so it wraps the rest of the onion);
 * it is recorded on the error path too — a failed invocation still
 * reports how long it took to fail.
 */
export function responseTimer(
  options: ResponseTimerOptions = {},
): RapidMiddleware {
  const header = options.header ?? 'x-response-time';
  const middleware: RapidMiddleware = async (ctx, next) => {
    const started = performance.now();
    try {
      await next();
    } finally {
      const ms = Math.round(performance.now() - started);
      if (options.stateKey !== undefined) {
        (ctx.state as Record<string, unknown>)[options.stateKey] = ms;
      }
      if (ctx.type === 'HTTP') {
        try {
          ctx.setHeader(header, `${ms}ms`);
        } catch {
          // The context was already finalized (an early respond()
          // downstream). Losing the header beats masking the real
          // outcome with a freeze error.
        }
      }
    }
  };
  return options.stateKey !== undefined
    ? markStateKeyUser(middleware)
    : middleware;
}

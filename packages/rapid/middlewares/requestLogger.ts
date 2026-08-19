/**
 * @fileoverview `requestLogger` — access-style logging for EVERY
 * transport: one registration logs HTTP requests, socket frames, and
 * job firings through the application's slogger (already correlated —
 * requestId/action arrive via the framework's ambient contextProvider).
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidContext, RapidMiddleware } from '../types/mod.ts';

/** Options for {@link requestLogger}. */
export type RequestLoggerOptions = {
  /**
   * Skip predicate — return `true` to not log this invocation (health
   * checks, noisy pollers). The chain still runs normally.
   */
  skip?: (ctx: RapidContext) => boolean;
};

/**
 * Build the access logger. Level tracks the outcome: 5xx → error,
 * 4xx → warn, everything else → info. A thrown error is logged with
 * its DISCLOSURE status (then rethrown for the shared cycle's full
 * error handling — this line is the access log, not the error log).
 *
 * Logged fields: `type`, `action`, `status`, `ms` (+ `matched` on
 * HTTP — when `false`, `action` is the raw, attacker-controlled
 * pathname; metrics pipelines should bucket those, not label them).
 */
export function requestLogger(
  options: RequestLoggerOptions = {},
): RapidMiddleware {
  return async (ctx, next) => {
    if (options.skip?.(ctx) === true) {
      return await next();
    }
    const started = performance.now();
    const fields = (): Record<string, unknown> => ({
      type: ctx.type,
      action: ctx.action,
      ms: Math.round(performance.now() - started),
      ...(ctx.type === 'HTTP' ? { matched: ctx.matched } : {}),
    });
    try {
      await next();
      // Read the INTERPRETED status (`ctx.status`), not
      // `ctx.response?.status` — the latter is null whenever the
      // content is null, so a `{ status: 401, content: null }`
      // short-circuit logged 204 while the transport actually sent
      // 401. Null content with the default 200 IS a 204, mirroring
      // serializeResponse.
      const status = ctx.type === 'HTTP' && ctx.response === null &&
          ctx.status === 200
        ? 204
        : ctx.status;
      const log = ctx.app.log;
      const line = { ...fields(), status };
      if (status >= 500) log.error('access', line);
      else if (status >= 400) log.warn('access', line);
      else log.info('access', line);
    } catch (error) {
      const err = RapidError.from(error);
      const log = ctx.app.log;
      const line = { ...fields(), status: err.status, code: err.code };
      if (err.status >= 500) log.error('access', line);
      else log.warn('access', line);
      throw error;
    }
  };
}

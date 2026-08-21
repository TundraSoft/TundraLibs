/**
 * @fileoverview `healthCheck` — answer a liveness/readiness path with a
 * JSON status, short-circuiting before routing. HTTP-only.
 *
 * @module
 */

import type { RapidMiddleware } from '../types/mod.ts';
import { MIDDLEWARE_SCOPE } from './scope.ts';

/** Options for {@link healthCheck}. */
export type HealthCheckOptions = {
  /**
   * Path to answer.
   * @default '/health'
   */
  path?: string;
  /**
   * Readiness probe — its resolved object is merged into the `200`
   * body; if it THROWS (or rejects), the endpoint answers `503
   * { status: 'unhealthy' }`. Omit for a bare liveness `200
   * { status: 'ok' }`.
   */
  check?: () =>
    | Record<string, unknown>
    | Promise<Record<string, unknown>>;
};

/**
 * Answer `options.path` with the health status, short-circuiting the
 * chain. Register with `app.use(...)`; it runs even for an unmatched
 * path (the global middleware runs on a route miss), so no route is
 * needed. Non-matching requests fall through untouched.
 */
export function healthCheck(options: HealthCheckOptions = {}): RapidMiddleware {
  const path = options.path ?? '/health';
  const check = options.check;

  const middleware: RapidMiddleware = async (ctx, next) => {
    if (ctx.type !== 'HTTP' || ctx.method !== 'GET') return next();
    if (new URL(ctx.url).pathname !== path) return next();

    if (check === undefined) {
      ctx.response = { content: { status: 'ok' } };
      return;
    }
    try {
      ctx.response = { content: { status: 'ok', ...(await check()) } };
    } catch {
      ctx.response = { status: 503, content: { status: 'unhealthy' } };
    }
  };
  return Object.assign(middleware, { [MIDDLEWARE_SCOPE]: ['HTTP'] });
}

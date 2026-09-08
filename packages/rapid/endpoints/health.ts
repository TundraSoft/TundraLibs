/**
 * @fileoverview `health()` — a mountable liveness/readiness endpoint:
 * `app.get('/healthz', health())`. Runs an optional readiness `check`
 * (503 if it throws), else 200. An ordinary route, so it appears in
 * OpenAPI, respects surfaces and versioning, and takes route middleware
 * like any other.
 *
 * @module
 */
import type { HTTPContext } from '../context/mod.ts';
import type { RapidContextState, RapidHTTPHandler } from '../types/mod.ts';

/** Options for {@link health}. */
export type HealthOptions<S extends RapidContextState = RapidContextState> = {
  /**
   * Readiness probe — throw (or reject) to report unhealthy (503; the
   * cause is logged at `warn`, never sent). Its return value is ignored.
   * @default none — a bare liveness 200
   */
  check?: (ctx: HTTPContext<S>) => unknown | Promise<unknown>;
};

/** An endpoint handler reporting `{ status: 'ok', instance, ... }`. */
export function health<S extends RapidContextState = RapidContextState>(
  options: HealthOptions<S> = {},
): RapidHTTPHandler<S> {
  return async (ctx) => {
    if (options.check !== undefined) {
      try {
        await options.check(ctx);
      } catch (error) {
        // Log the cause server-side — NEVER put it on the wire. A readiness
        // `check` typically touches a DB/downstream whose error message can
        // embed DSNs, hostnames, or credentials; `/healthz` is public.
        ctx.app.log.warn('readiness check failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
        return { status: 503, content: { status: 'unhealthy' } };
      }
    }
    return { content: { status: 'ok', instance: ctx.app.instanceId } };
  };
}

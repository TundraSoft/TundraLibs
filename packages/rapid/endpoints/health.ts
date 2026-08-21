/**
 * @fileoverview `health()` — a mountable liveness/readiness endpoint:
 * `app.get('/healthz', health())`. Runs an optional readiness `check`
 * (503 if it throws), else 200. The `healthCheck` middleware
 * (`./middlewares`) is the path-intercepting flavour; this is the explicit
 * route.
 *
 * @module
 */
import type { HTTPContext } from '../context/mod.ts';
import type { RapidContextState, RapidHTTPHandler } from '../types/mod.ts';

/** Options for {@link health}. */
export type HealthOptions<S extends RapidContextState = RapidContextState> = {
  /** Readiness probe — throw (or reject) to report unhealthy. */
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
        return {
          status: 503,
          content: {
            status: 'unhealthy',
            reason: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }
    return { content: { status: 'ok', instance: ctx.app.instanceId } };
  };
}

/**
 * @fileoverview `ready()` — a mountable READINESS endpoint, the partner of
 * `health()` (liveness): `app.get('/readyz', ready({ check }))`. Answers
 * 503 the moment `app.stop()` begins, so a load balancer stops sending
 * traffic during the drain window, 503 when the dependency `check`
 * throws, else 200. Point the platform's readiness probe here and its
 * liveness probe at `health()`.
 *
 * @module
 */
import type { HTTPContext } from '../context/mod.ts';
import type { RapidContextState, RapidHTTPHandler } from '../types/mod.ts';

/** Options for {@link ready}. */
export type ReadyOptions<S extends RapidContextState = RapidContextState> = {
  /**
   * Dependency probe — throw (or reject) to report not ready (503; the
   * cause is logged at `warn`, never sent). Its return value is ignored.
   * @default none — ready unless draining
   */
  check?: (ctx: HTTPContext<S>) => unknown | Promise<unknown>;
};

/**
 * An endpoint handler reporting `{ status: 'ready', instance }`, or 503
 * `{ status: 'draining' }` once `stop()` began / `{ status: 'unhealthy' }`
 * when `check` fails.
 */
export function ready<S extends RapidContextState = RapidContextState>(
  options: ReadyOptions<S> = {},
): RapidHTTPHandler<S> {
  return async (ctx) => {
    if (ctx.app.stopping) {
      return { status: 503, content: { status: 'draining' } };
    }
    if (options.check !== undefined) {
      try {
        await options.check(ctx);
      } catch (error) {
        // Server-side only — a readiness check touches downstreams whose
        // messages can embed DSNs and hostnames; the probe path is public.
        ctx.app.log.warn('readiness check failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
        return { status: 503, content: { status: 'unhealthy' } };
      }
    }
    return { content: { status: 'ready', instance: ctx.app.instanceId } };
  };
}

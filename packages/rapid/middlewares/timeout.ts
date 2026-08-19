/**
 * @fileoverview `timeout` — a per-invocation deadline on every
 * transport: it bounds how long the framework WAITS, which is all an
 * in-process deadline can honestly do.
 *
 * On JOBS this matters twice over. A wedged handler otherwise blocks
 * its own schedule silently (cronus's overlap guard skips every later
 * tick); the deadline turns that into a visible RAPID_TIMEOUT outcome.
 * But the abandoned work keeps running — JavaScript cannot cancel a
 * promise — so the middleware hands it to `ctx.detach()`, and the job
 * transport holds cronus's slot until it settles. Without that, every
 * tick would start ANOTHER copy of the wedged handler: the deadline
 * would silently convert the scheduler from "skip while running" to
 * unbounded concurrency the caller never asked for. (Schedulers that
 * genuinely kill overrunning work — Kubernetes `activeDeadlineSeconds`,
 * Celery's hard limit — all do it at a process boundary we do not
 * have.)
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidMiddleware } from '../types/mod.ts';

/**
 * Build the deadline middleware. `ms` is the budget for EVERYTHING
 * inside this middleware (downstream middleware + handler).
 *
 * LIMITS, by design: JavaScript has no preemptive cancellation — on
 * timeout the response is overridden (504 RAPID_TIMEOUT) but the
 * underlying work CONTINUES in the background; its late result and
 * errors are discarded. The abandoned work is registered via
 * {@link Context.detach}, which is what lets the job transport keep
 * cronus's overlap guard held until it settles (see the module
 * docblock). And a handler that settles in a photo-finish with the
 * deadline may still win the response — the deadline is best-effort,
 * not a fence.
 *
 * @throws {RapidError} RAPID_CONFIG when `ms` is not a positive
 *   integer (factory time — a config error is a boot error).
 * @throws {RapidError} RAPID_TIMEOUT (504) as a rejection of the
 *   middleware's promise when the deadline fires.
 */
export function timeout(ms: number): RapidMiddleware {
  if (!Number.isInteger(ms) || ms < 1) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'timeout(ms) must be a positive integer',
      details: { ms },
    });
  }
  return async (ctx, next) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = next();
    // A late rejection AFTER the deadline fired must not become an
    // unhandled rejection (the race has already settled) — mark it
    // handled. A rejection BEFORE the deadline still propagates
    // through the race below.
    work.catch(() => {});
    try {
      await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            // Hand the still-running work to the context BEFORE
            // rejecting: transports that own a concurrency slot (jobs)
            // must not free it while this is in flight.
            ctx.detach(work);
            reject(
              new RapidError('RAPID_TIMEOUT', {
                details: { ms, action: ctx.action },
              }),
            );
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

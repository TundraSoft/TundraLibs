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
import { meterAction } from '../utils/Meter.ts';
import type { RapidMiddleware } from '../types/mod.ts';

/**
 * Build the deadline middleware. `seconds` is the budget for EVERYTHING
 * inside this middleware (downstream middleware + handler) — a positive
 * number of seconds; fractions are fine (`timeout(0.5)` is 500 ms).
 *
 * LIMITS, by design: JavaScript has no preemptive cancellation — on
 * timeout the response is overridden (504 RAPID_TIMEOUT) but the
 * underlying work CONTINUES in the background; its late result and
 * errors are discarded. The abandoned work is registered via
 * {@link Context.detach}, which is what lets the job transport keep
 * cronus's overlap guard held until it settles (see the module
 * docblock). And a handler that settles in a photo-finish with the
 * deadline may still win the response — the deadline is best-effort,
 * not a fence. Combined with `idempotency()` (either order) a fired
 * deadline leaves that request's key PENDING until its pending TTL — a
 * retry is a 409 rather than a second execution of work that may still
 * be running.
 *
 * @throws {RapidError} RAPID_CONFIG when `seconds` is not a positive
 *   finite number of at least one millisecond (factory time — a config
 *   error is a boot error).
 * @throws {RapidError} RAPID_TIMEOUT (504) as a rejection of the
 *   middleware's promise when the deadline fires.
 */
export function timeout(seconds: number): RapidMiddleware {
  const ms = Math.round(seconds * 1000);
  if (!Number.isFinite(seconds) || seconds <= 0 || ms < 1) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        'timeout(seconds) must be a positive number of seconds (fractions allowed, at least 0.001)',
      details: { seconds },
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
            ctx.meter?.middleware('timeout', 'fired', meterAction(ctx));
            ctx.detach(work);
            reject(
              new RapidError('RAPID_TIMEOUT', {
                details: { seconds, action: ctx.action },
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

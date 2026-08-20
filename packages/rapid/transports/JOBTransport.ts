import { Cronus } from '@tundralibs/cronus';
import { JOBContext, type JobTick } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { compose } from '../utils/mod.ts';
import type {
  RapidApplicationJobMetrics,
  RapidContextState,
  RapidJobEntry,
} from '../types/mod.ts';
import { Transport } from './Transport.ts';

/**
 * The scheduled-job transport: CRONUS decides WHEN (tick-and-match
 * cron with per-job overlap prevention); this transport decides WHAT a
 * firing means — a JOBContext through the shared invocation cycle,
 * outcome logged.
 */
export class JOBTransport<S extends RapidContextState = RapidContextState>
  extends Transport<S> {
  private __cronus?: Cronus;
  /**
   * The universal onion, composed ONCE (lazily — `triggerJob` can fire
   * through a THROWAWAY transport before `start()` ever runs) and
   * reused for every firing — there is no per-job chain (see `__run`),
   * so one composition serves every job on this transport.
   */
  private __composedChain?: (
    ctx: JOBContext<S>,
    next: () => void | Promise<void>,
  ) => void | Promise<void>;

  public start(): Promise<void> {
    // unref: the HTTP server (or the caller) owns the process
    // lifecycle — a pending tick must never block shutdown.
    const cronus = new Cronus({ unref: true });
    cronus.on('skip', (name) => {
      this._app.log.debug('job tick skipped — previous run still going', {
        job: name,
      });
    });
    // Defensive: __run never rejects (the shared cycle catches), but a
    // scheduler-level failure must never be silent.
    cronus.on('error', (_id, name, _at, _ms, error) => {
      this._app.log.error('job scheduling failed', {
        job: name,
        error: error.message,
      });
    });
    for (const job of this._app.jobs) {
      // Schedules were validated at registration; cannot throw here.
      // Scheduled firings carry the registration-default params only
      // (no overrides — those exist solely on the trigger path).
      cronus.add(job.name, job.schedule, async (run) => {
        await this.__run(
          job,
          {
            scheduledAt: run.scheduledAt,
            firedAt: new Date(),
            count: run.runCount,
          },
          undefined,
          true,
        ); // hold the slot until detached work settles
      });
    }
    cronus.start();
    this.__cronus = cronus;
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.__cronus?.stop();
    this.__cronus = undefined;
    return Promise.resolve();
  }

  /** Scheduler observability passthrough (vitals later). */
  public jobs() {
    return this.__cronus?.list() ?? [];
  }

  /**
   * Cron scheduler statistics — registered/running counts plus each
   * job's snapshot (run count, last run, currently executing). Reflects
   * live cronus state; not gated on `server.metrics` (cronus always
   * tracks these).
   */
  public get metrics(): RapidApplicationJobMetrics {
    const jobs = this.__cronus?.list() ?? [];
    return {
      total: jobs.length,
      running: jobs.reduce((n, j) => n + (j.running ? 1 : 0), 0),
      jobs,
    };
  }

  /**
   * Fire a job NOW — bypasses the schedule; `count: -1`; the outcome
   * returns to the CALLER instead of only being logged. `args` merge
   * OVER the job's registration defaults for this firing only.
   *
   * @throws {RapidError} RAPID_CONFIG when no job is registered under
   *   `name`.
   */
  public async triggerNow(
    name: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<{ status: number; content: unknown; handlerRan: boolean }> {
    const job = this._app.jobs.find((entry) => entry.name === name);
    if (job === undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message: `No job registered under '${name}'`,
        details: { name },
      });
    }
    const now = new Date();
    return await this.__run(job, {
      scheduledAt: now,
      firedAt: now,
      count: -1,
    }, args);
  }

  /**
   * @param holdDetached - SCHEDULED firings pass `true`: this method's
   *   promise IS what cronus's overlap guard keys off, so it must not
   *   resolve while work abandoned by a middleware (a `timeout()` that
   *   won its race) is still running — otherwise the next tick starts
   *   another copy of a wedged handler. The trigger path passes
   *   `false`: no scheduler slot is at stake and the caller is waiting
   *   for the outcome.
   */
  private async __run(
    job: RapidJobEntry<S>,
    tick: JobTick,
    overrides?: Readonly<Record<string, unknown>>,
    holdDetached = false,
  ): Promise<{ status: number; content: unknown; handlerRan: boolean }> {
    const ctx = new JOBContext<S>(this._app, {
      job: job.name,
      tick,
      // Registration defaults ⊕ trigger overrides (shallow, per key).
      params: { ...job.args, ...overrides },
    });
    let handlerRan = false;
    this.__composedChain ??= compose<S, JOBContext<S>>(
      // The universal onion runs on job firings too — same chain, same
      // order as HTTP and sockets. Base-typed middleware fit the
      // S-typed context (same object at runtime); the cast bridges the
      // generic.
      this._app.middlewares as unknown as readonly ((
        ctx: JOBContext<S>,
        next: () => void | Promise<void>,
      ) => void | Promise<void>)[],
    );
    await this._invoke<JOBContext<S>>(
      ctx,
      this.__composedChain,
      async () => {
        handlerRan = true;
        const returned = await job.handler(ctx);
        if (returned !== undefined && ctx.response === null) {
          ctx.response = returned;
        }
      },
    );
    let outcome: { status: number; content: unknown };
    try {
      outcome = ctx.respond();
    } catch (error) {
      // The context was finalized EARLY (something called respond()
      // mid-chain). Parity with HTTP's finalize: a uniform 500 outcome,
      // never a path-dependent rejection.
      const err = RapidError.from(error);
      this._app.log.error('job finalization failed', {
        job: job.name,
        code: err.code,
      });
      outcome = {
        status: 500,
        content: { code: err.code, message: 'Internal server error' },
      };
    }
    if (!handlerRan) {
      // A middleware short-circuited (never called next()). On HTTP
      // that is a visible response; on a background job it would be an
      // INVISIBLE no-op — so it is a distinct, WARN-level outcome,
      // never a debug "finished".
      this._app.log.warn('job skipped by middleware', {
        job: job.name,
        status: outcome.status,
        drift: ctx.drift,
      });
    } else {
      // Debug always — a failure was already logged with full detail
      // by the shared _invoke cycle; this is just the lifecycle
      // bookend.
      this._app.log.debug('job finished', {
        job: job.name,
        status: outcome.status,
        drift: ctx.drift,
      });
    }
    // The outcome is REPORTED above (promptly, at the deadline); only
    // the slot is held. Cronus's guard keys off this promise, so
    // resolving here with work still in flight would let the next tick
    // start another copy of a wedged handler.
    if (holdDetached) await ctx.settleDetached();
    return { ...outcome, handlerRan };
  }
}

import type { StatusCode } from '@tundralibs/compat/http';
import type { Application } from '../Application.ts';
import { Context } from './Context.ts';
import { RapidError } from '../errors/mod.ts';
import { parsePaging } from '../utils/mod.ts';
import type {
  RapidContextArgs,
  RapidContextResponse,
  RapidContextState,
} from '../types/mod.ts';

/** One scheduler firing — drift is measurable from the two timestamps. */
export type JobTick = {
  /** When the schedule SAID to fire. */
  scheduledAt: Date;
  /** When it ACTUALLY fired. */
  firedAt: Date;
  /** Fire counter since app start (`-1` for a manually triggered run). */
  count: number;
};

/** Construction data for a {@link JOBContext}. */
export type JOBContextInit = {
  /** The job's registered name. */
  job: string;
  /** This firing's metadata. */
  tick: JobTick;
  /**
   * Invocation params — registration defaults merged under trigger
   * overrides (the TRANSPORT merges; the context only carries).
   */
  params?: Readonly<Record<string, unknown>>;
};

/**
 * The scheduled-job transport context — one per tick. Carries the tick
 * metadata (drift measurement, fire counter) and the job's identity;
 * scheduled runs execute under a DECLARED system principal, never an
 * implicit all-permissions escalation (the clearremit lesson).
 */
export class JOBContext<S extends RapidContextState = RapidContextState>
  extends Context<S, { status: StatusCode; content: unknown }> {
  public readonly type = 'JOB';
  /** The job's registered name. */
  public readonly job: string;
  /** This firing's metadata. */
  public readonly tick: JobTick;
  /** Invocation params (see {@link JOBContextInit.params}). */
  private readonly __params: Readonly<Record<string, unknown>>;
  /** Lazy args cache — see the base {@link Context.args} contract. */
  private __args: Readonly<RapidContextArgs> | undefined = undefined;

  constructor(app: Application<S>, init: JOBContextInit) {
    super(app, { action: init.job });
    this.job = init.job;
    this.tick = init.tick;
    this.__params = init.params ?? {};
  }

  /**
   * JOB args: `params` = registration defaults ⊕ trigger overrides
   * (merged by the transport); query is empty and paging resolves to
   * the configured defaults — jobs carry the same shape as everything
   * else so shared middleware reads one contract. `payload` stays the
   * base `undefined` (a job has no body channel).
   */
  public get args(): Readonly<RapidContextArgs> {
    this.__args ??= Object.freeze({
      // Frozen so the advertised Readonly holds at runtime.
      params: Object.freeze(this.__params),
      query: { filters: {}, sorting: [] },
      paging: parsePaging(this.app.option('server')!.paging ?? {}),
    });
    return this.__args;
  }

  /**
   * JOB consumes `status` as the outcome. CONTEXT CONTRACT (all
   * transports): a body-only override never changes an already-set
   * status — a post-processing middleware enriching `content` must not
   * convert a failure outcome into a 200. A 3xx is REJECTED AT SET
   * TIME — redirects have no meaning on a background job.
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID on a 3xx status, or
   *   after {@link respond}.
   */
  public override set response(response: RapidContextResponse | null) {
    if (
      response?.status !== undefined &&
      response.status >= 300 && response.status < 400
    ) {
      throw new RapidError('RAPID_RESPONSE_INVALID', {
        message: 'A 3xx status has no meaning on a background job',
        debug: { job: this.job, status: response.status },
      });
    }
    super.response = response;
    if (response === null) {
      this._status = 200;
      return;
    }
    if (response.status !== undefined) this._status = response.status;
  }

  public override get response(): Readonly<RapidContextResponse> | null {
    const base = super.response;
    return base === null
      ? null
      : { content: base.content, status: this._status };
  }

  /** Milliseconds between the scheduled and actual fire time. */
  public get drift(): number {
    return this.tick.firedAt.getTime() - this.tick.scheduledAt.getTime();
  }

  /**
   * The job outcome — status carries success/failure semantics for the
   * scheduler (logged, never sent anywhere); body is the job's result.
   */
  protected _respond(): { status: StatusCode; content: unknown } {
    return { status: this._status, content: this._content };
  }
}

import type { StatusCode } from '@tundralibs/compat/http';
import type { Slogger } from '@tundralibs/slogger';
import type { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidContextArgs,
  RapidContextResponse,
  RapidContextState,
  RapidContextType,
} from '../types/mod.ts';

/** Base construction data — subtypes compose it from their own inits. */
export type ContextInit = {
  /** Uniform invocation identity (route / job / command). */
  action: string;
  /** Pre-validated correlation id; minted (ulid) when absent. */
  requestId?: string;
};

/**
 * The abstract per-invocation context. Constructed by the transport for
 * its type; carries the application reference — config flows through
 * `ctx.app.config(...)`, never threaded.
 */
export abstract class Context<
  S extends RapidContextState = RapidContextState,
  R = unknown,
> {
  public readonly app: Application<S>;
  /** The invocation's state bag, loaded from {@link Application.state}. */
  public state: S;
  /**
   * The invocation's correlation id — a ULID by default (sortable in
   * logs); transports MAY adopt a validated inbound value instead (HTTP
   * reads its header at construction). Adopted ids are not guaranteed
   * unique per invocation (retries reuse them) — that is the point of
   * correlation. NEVER use it to name filesystem resources.
   */
  public readonly requestId: string;
  /**
   * Uniform invocation identity — the route pattern, job name, or
   * command. Generic consumers (logging, tracing, error context) read
   * this without switching on {@link type}; per-type fields stay as the
   * richer aliases. On unmatched HTTP requests this is the RAW pathname
   * — attacker-controlled; treat accordingly in log pipelines.
   */
  public readonly action: string;
  public abstract readonly type: RapidContextType;
  /**
   * The uniform invocation arguments — one shape on every transport
   * (see {@link RapidContextArgs} for the per-transport sourcing). Built
   * LAZILY on first access and cached; structural violations (query
   * caps, a non-object socket payload) throw HERE, so invocations that
   * never read args never pay for — or fail on — them.
   *
   * @throws {RapidError} RAPID_QUERY_INVALID (HTTP) when the query
   *   exceeds a structural cap; RAPID_VALIDATION_FAILED (SOCKET) when
   *   the frame payload is not an object — first access only.
   */
  public abstract get args(): Readonly<RapidContextArgs>;
  /** Abandoned-but-running work — see {@link detach}. */
  private readonly __detached: Promise<unknown>[] = [];
  /** The interpreted outcome status — subtypes narrow it per transport. */
  protected _status: StatusCode = 200;
  /** The universal part of the response — what every transport emits. */
  protected _content: RapidContextResponse['content'] | null = null;
  /** Set by {@link respond} — the point of no return. */
  protected _responded = false;

  /**
   * The application logger, delegated — context code (and subclasses)
   * log via `this._log`; correlation arrives through the framework's
   * contextProvider, no threading.
   */
  protected get _log(): Slogger {
    return this.app.log;
  }

  constructor(app: Application<S>, init: ContextInit) {
    this.app = app;
    // The app is the state factory (stateMode: CLONE/EMPTY/SHARE).
    this.state = app.state;
    this.action = init.action;
    // Transport-supplied, or minted by the app — the id FACTORY lives on
    // the Application (policy in one place), contexts only carry.
    this.requestId = init.requestId ?? app.newRequestId();
  }

  /**
   * The INTERPRETED outcome status — 200 until something sets one.
   * Distinct from `response?.status`, which is `null` whenever the
   * content is null: a middleware that sets `{ status: 401, content:
   * null }` leaves `response === null` but the transport still sends
   * 401, so observability code must read THIS to agree with the wire.
   */
  public get status(): StatusCode {
    return this._status;
  }

  /**
   * The invocation payload — the RESERVED lazy body channel, uniform
   * via await: HTTP overrides with a cached parse PROMISE, SOCKET with
   * the frame's decoded value (synchronous), and here at the base it is
   * `undefined` (JOB inherits this). `await ctx.payload` behaves
   * identically on all three — awaiting a non-promise passes it
   * through — so one shared middleware needs no type ladder.
   */
  public get payload(): unknown {
    return undefined;
  }

  /**
   * Register work this invocation ABANDONED but that is still running
   * — a `timeout()` that won its race, or any fire-and-forget a
   * middleware starts. JavaScript cannot cancel a promise, so the
   * honest thing is to track it rather than pretend it stopped.
   *
   * Transports that own a CONCURRENCY SLOT consume this: the job
   * transport awaits registered work after reporting the outcome, so
   * cronus's overlap guard is not released while the previous run is
   * still in flight (otherwise every tick would launch another copy of
   * a wedged job). HTTP has no slot and ignores it — the response has
   * already been sent.
   *
   * @param work - The abandoned promise. Its REJECTION is absorbed
   *   here (the invocation already reported an outcome), so callers
   *   need no separate unhandled-rejection guard.
   */
  public detach(work: Promise<unknown>): void {
    this.__detached.push(work);
  }

  /**
   * Await every promise handed to {@link detach}. NEVER rejects and
   * never throws — abandoned work has no outcome left to report.
   * Resolves immediately when nothing was detached.
   */
  public async settleDetached(): Promise<void> {
    if (this.__detached.length === 0) return;
    await Promise.allSettled(this.__detached);
  }

  /**
   * cleanup
   *
   * Cleanup action
   */
  public cleanup(): void;
  public cleanup(): Promise<void>;
  public cleanup(): void | Promise<void> {
    return;
  }

  /**
   * Set — or OVERRIDE — the response (`null` clears it). Overwriting is
   * legal right up to {@link respond}: that is what lets error handling
   * replace a half-built success response. After `respond()` nothing can
   * change and this throws.
   *
   * The base consumes only `content`; subtypes override to interpret the
   * keys their transport understands (and MUST call `super.response =`
   * so content storage and the freeze guard stay in one place).
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID after {@link respond}.
   */
  public set response(response: RapidContextResponse | null) {
    this._assertNotResponded();
    this._content = response?.content ?? null;
  }

  /**
   * The interpreted response so far (`null` until one is set). Subtypes
   * override to compose their extras back in (HTTP adds status/headers).
   */
  public get response(): Readonly<RapidContextResponse> | null {
    return this._content === null ? null : { content: this._content };
  }

  /**
   * This will return the response information basis the context type.
   * in HTTP context, it would be a Response object, in SOCKET context
   * it would be a message to send back, in CLI context it would be
   * a string to print to the console, and in JOB context it would be
   * a status of the job.
   *
   * Materializing is the point of no return — and the BASE owns it
   * (template method): the freeze happens here, unconditionally, before
   * delegating to the subtype's {@link _respond}. A context type cannot
   * forget to freeze. After this, the `response` setter (and any
   * subtype mutators) throw, and a second `respond()` throws too.
   *
   * This will be handled by the rAPId class
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID on a second call —
   *   respond() is once-only.
   */
  public respond(): R {
    this._assertNotResponded();
    this._responded = true;
    return this._respond();
  }

  /**
   * Subtype materialization ONLY — no lifecycle duties. Runs after the
   * base has frozen the context.
   */
  protected abstract _respond(): R;

  /** Freeze guard — subtypes use it for their own mutators too. */
  protected _assertNotResponded(): void {
    if (this._responded) {
      throw new RapidError('RAPID_RESPONSE_INVALID', {
        message: 'Response has already been sent for this context instance',
        debug: {
          requestId: this.requestId,
          action: this.action,
          type: this.type,
        },
      });
    }
  }
}

import type { StatusCode } from '@tundralibs/compat/http';
import type { Meter } from '../utils/Meter.ts';
import type { Slogger } from '@tundralibs/slogger';
import type { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { isStreamBody } from '../utils/streams.ts';
import type {
  RapidApplicationJobMetrics,
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
  /** The owning application — config, publish, and the id factory flow through it. */
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
  /** The transport discriminator (`'HTTP' | 'SOCKET' | 'JOB'`) — each subtype fixes it. */
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

  /** Bind the application, load the per-invocation state, and adopt or mint the requestId. */
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
   * Server-initiated push to subscribers of `channel` — the same
   * {@link Application.publish}, reachable from a handler/middleware.
   * Fire-and-forget; a no-op when nobody is subscribed.
   *
   * ON THE BASE CONTEXT BY DESIGN: fan-out is cross-transport. An HTTP
   * handler publishing to socket subscribers (a POST that broadcasts a new
   * comment) is the canonical pattern, and a cron JOB pushing an update is
   * equally valid — so `publish` is available on every transport, unlike the
   * HTTP-server counters, which moved off the base (read `ctx.app.metrics`).
   */
  public publish(channel: string, data: unknown): Promise<void> {
    return this.app.publish(channel, data);
  }

  protected _auth?: Record<string, unknown>;

  /**
   * The authenticated identity for this invocation, or `undefined` when
   * anonymous — a set-once, read-only bag an authentication middleware
   * fills (`ctx.setAuth(...)`). The caller type-casts on use
   * (`ctx.auth as MyUser`). Distinct from `ctx.state`: never shared across
   * invocations, and it rides the module `invoke` seed.
   */
  public get auth(): Record<string, unknown> | undefined {
    return this._auth;
  }

  /**
   * Set the auth bag — once. A second call throws, so a later middleware
   * can't silently overwrite the identity.
   *
   * @throws {RapidError} RAPID_CONFIG when auth is already set.
   */
  public setAuth(auth: Record<string, unknown>): void {
    if (this._auth !== undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'ctx.auth is already set — the auth bag is written once',
      });
    }
    this._auth = auth;
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

  /** The metrics recorder ({@link Application.meter}); `undefined` when off. */
  public get meter(): Meter | undefined {
    return this.app.meter;
  }

  /** Live cron scheduler statistics — see {@link Application.jobMetrics}. */
  public get jobMetrics(): RapidApplicationJobMetrics | undefined {
    return this.app.jobMetrics;
  }

  /**
   * The application's loaded configuration — every config set beside
   * `Application` (`configs/Auth.yaml` → `ctx.config.get('auth.…')`), so
   * a middleware can read settings without reaching through `ctx.app`.
   * Set names are the file basename LOWERCASED at load; the keys after
   * the set are case-sensitive. Any transport — config is not
   * request-bound.
   */
  public get config(): Application<S>['config'] {
    return this.app.config;
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
    // Absorb the rejection NOW, not just in settleDetached() — that only
    // runs for the JOB slot-hold (scheduled firings), so on HTTP / SOCKET /
    // triggerJob a rejected detached promise would otherwise be an
    // unhandled rejection (process-fatal on Node/Deno), breaking the
    // "callers need no guard" contract above. allSettled still awaits it.
    work.catch(() => {});
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
   * Post-response cleanup — free the per-invocation resources a transport
   * tracked (HTTP deletes the body parse's upload temp files). The base is
   * a no-op; only transports with something to release override it.
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
    this._setBaseResponse(response);
  }

  /**
   * The interpreted response so far (`null` until one is set). Subtypes
   * override to compose their extras back in (HTTP adds status/headers).
   */
  public get response(): Readonly<RapidContextResponse> | null {
    return this._content === null ? null : { content: this._content };
  }

  /** The base setter's body — content storage + the freeze guard, in one place. */
  protected _setBaseResponse(response: RapidContextResponse | null): void {
    this._assertNotResponded();
    this._content = response?.content ?? null;
  }

  /**
   * The shared `response` SETTER for the non-HTTP envelope transports (JOB,
   * SOCKET): both consume `status` as the outcome and reject a 3xx (no
   * redirects) and a stream body (HTTP-only), differing only in the wording.
   * `subject` is the noun ('a background job' / 'a socket frame') and `debug`
   * the per-transport identity ({ job } / { command }).
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID on a 3xx status, a stream
   *   body, or after {@link respond}.
   */
  protected _setEnvelopeResponse(
    response: RapidContextResponse | null,
    subject: string,
    debug: Record<string, unknown>,
  ): void {
    if (
      response?.status !== undefined &&
      response.status >= 300 && response.status < 400
    ) {
      throw new RapidError('RAPID_RESPONSE_INVALID', {
        message: `A 3xx status has no meaning on ${subject}`,
        debug: { ...debug, status: response.status },
      });
    }
    if (response !== null && isStreamBody(response.content)) {
      throw new RapidError('RAPID_RESPONSE_INVALID', {
        message: `A stream body has no meaning on ${subject} (HTTP-only)`,
        debug,
      });
    }
    this._setBaseResponse(response);
    this._status = response === null ? 200 : (response.status ?? this._status);
  }

  /** The shared `response` GETTER for the envelope transports — `content` + outcome `status`. */
  protected _envelopeResponse(): Readonly<RapidContextResponse> | null {
    return this._content === null
      ? null
      : { content: this._content, status: this._status };
  }

  /**
   * Materialize the response for this context's transport: a `Response`
   * object for HTTP, a `{ status, content }` frame for SOCKET, and the
   * `{ status, content }` job outcome for JOB.
   *
   * Materializing is the point of no return — and the BASE owns it
   * (template method): the freeze happens here, unconditionally, before
   * delegating to the subtype's {@link _respond}. A context type cannot
   * forget to freeze. After this, the `response` setter (and any
   * subtype mutators) throw, and a second `respond()` throws too.
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

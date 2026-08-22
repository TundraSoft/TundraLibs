import { ambient } from '@tundralibs/ambient';
import { SpanKind } from '@tundralibs/tracer';
import type { Application } from '../Application.ts';
import type { Context } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type { Meter } from '../utils/Meter.ts';
import { attachContainer } from '../utils/requestContainer.ts';
import type {
  RapidContext,
  RapidContextResponse,
  RapidContextState,
} from '../types/mod.ts';

/**
 * The invariant slice of every invocation, whatever the trigger. The
 * scratch-repo audit's D5 finding is the reason this is BASE-owned:
 * its predecessor implemented the cycle four times with four different
 * semantics (HTTP validated, cron didn't). Here it exists once.
 *
 * Transports own their trigger machinery (listener, scheduler) and
 * their context construction; the cycle they run it through is shared.
 */
export abstract class Transport<
  S extends RapidContextState = RapidContextState,
> {
  constructor(protected readonly _app: Application<S>) {}

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;

  /** Span kind for this transport's invocations (HTTP overrides). */
  protected _spanKind: SpanKind = SpanKind.INTERNAL;

  /**
   * Run one invocation: ambient scope (log correlation) → optional
   * span (joins `parent` when the transport extracted one) → the
   * middleware onion → `dispatch` innermost → optional `finalize`.
   * Anything thrown lands as a response OVERRIDE under the disclosure
   * mode — full detail is logged server-side, the context is ALWAYS
   * respondable afterwards.
   *
   * `chain` is a PRE-COMPOSED onion (`compose(middlewares)`), not the
   * raw middleware array — composing allocates a fresh runner closure
   * per call, and the middleware LIST for a given route/command/job
   * never changes between invocations, so every transport composes
   * once (at registration) and passes the same runner every time.
   *
   * `finalize`, when given, runs LAST — still inside this call's ONE
   * ambient scope, whether or not the onion threw — and its result
   * becomes `_invoke`'s own return value. This exists so a transport
   * whose finalization step (materializing a response, cleanup) also
   * needs correlated logging doesn't have to open a SECOND
   * `ambient.run()` around it after `_invoke` returns (HTTP used to;
   * the two scopes always carried the identical, already-immutable
   * `requestId`/`action`, so nesting inside one call is free of any
   * behavior change). Callers that don't need this (JOB, SOCKET —
   * their post-invoke logging isn't ambient-correlated today, and
   * this doesn't change that) simply omit it.
   */
  /**
   * The invocation cycle, bracketed by metrics when `server.metrics` is
   * on: in-flight up, run, in-flight down + count + latency. Off → the
   * inner call directly, no allocation.
   */
  protected _invoke<C extends Context<S, unknown>, R = void>(
    ctx: C,
    chain: (ctx: C, next: () => void | Promise<void>) => void | Promise<void>,
    dispatch: () => void | Promise<void>,
    parent?: unknown,
    attributes?: Record<string, string | number | boolean>,
    finalize?: () => R | Promise<R>,
  ): R | Promise<R> {
    const meter: Meter | undefined = this._app.meter;
    if (meter === undefined) {
      return this.__runInvoke(
        ctx,
        chain,
        dispatch,
        parent,
        attributes,
        finalize,
      );
    }
    const transport = ctx.type;
    const start = meter.begin(transport);
    const close = (): void =>
      meter.end({
        transport,
        action: this.__identity(ctx),
        status: ctx.status,
        start,
      });
    let result: R | Promise<R>;
    try {
      result = this.__runInvoke<C, R>(
        ctx,
        chain,
        dispatch,
        parent,
        attributes,
        finalize,
      );
    } catch (error) {
      // A synchronous throw from `__runInvoke` (e.g. a logging handler in
      // `disclose` that itself throws) must still close the in-flight
      // gauge — `begin()` already incremented it.
      close();
      throw error;
    }
    if (
      result !== undefined && typeof (result as Promise<R>).then === 'function'
    ) {
      return (result as Promise<R>).then(
        (r) => {
          close();
          return r;
        },
        (e) => {
          close();
          throw e;
        },
      );
    }
    close();
    return result;
  }

  /**
   * The low-cardinality identity used for metric labels and the span name.
   * An unmatched HTTP request's `action` is the raw request path — which is
   * attacker-controlled (see `HTTPContext.matched`) and would mint a fresh
   * metric time-series per distinct 404 URL (a memory-exhaustion vector).
   * Collapse it to `<METHOD> <unmatched>` so metric cardinality stays
   * bounded by real routes. SOCKET/JOB actions are already bounded (command
   * / job names), so they pass through unchanged.
   */
  private __identity(ctx: Context<S, unknown>): string {
    if (
      ctx.type === 'HTTP' && (ctx as { matched?: boolean }).matched === false
    ) {
      const sp = ctx.action.indexOf(' ');
      const method = sp === -1 ? ctx.action : ctx.action.slice(0, sp);
      return `${method} <unmatched>`;
    }
    return ctx.action;
  }

  private __runInvoke<C extends Context<S, unknown>, R = void>(
    ctx: C,
    chain: (ctx: C, next: () => void | Promise<void>) => void | Promise<void>,
    dispatch: () => void | Promise<void>,
    parent?: unknown,
    attributes?: Record<string, string | number | boolean>,
    finalize?: () => R | Promise<R>,
  ): R | Promise<R> {
    return ambient.run(
      { requestId: ctx.requestId, action: ctx.action },
      (): R | Promise<R> => {
        // Pin the app container so a handler's inject() — even after an
        // await — resolves against THIS app, not the global Doctor.
        attachContainer(this._app.container);
        // Turn any throw from the onion into the disclosure override —
        // legal right up to respond(); echo headers survive. Synchronous
        // (no await), so it runs on both the sync and async paths.
        const disclose = (error: unknown): void => {
          const err = RapidError.from(error);
          this._app.log.error(err.message, {
            code: err.code,
            requestId: ctx.requestId,
            stack: err.stack,
            ...err.context.debug,
          });
          // The payload carries `requestId` so it appears in the BODY
          // too, consistent with the 404 shape (the header always has it).
          try {
            // app.onError may override the envelope. It runs in THIS ambient
            // scope (its logs correlate). A hook that throws never breaks
            // disclosure — it's logged and the default envelope is used.
            let override: RapidContextResponse | void = undefined;
            try {
              override = this._app.errorHook?.(
                err,
                ctx as unknown as RapidContext<S>,
              );
            } catch (hookError) {
              this._app.log.error(
                'app.onError handler threw — using the default disclosure',
                {
                  requestId: ctx.requestId,
                  error: hookError instanceof Error
                    ? hookError.message
                    : String(hookError),
                },
              );
            }
            if (override !== undefined && override !== null) {
              ctx.response = override;
            } else {
              const payload = err.payload(this._app.mode);
              ctx.response = {
                status: err.status,
                content: typeof payload === 'object' && payload !== null
                  ? { ...payload, requestId: ctx.requestId }
                  : payload,
              };
            }
          } catch {
            // The context was already finalized (a middleware called
            // respond() early), or the override was malformed. The committed
            // response stands; the failure is already logged above.
          }
        };
        const finish = (): R | Promise<R> =>
          finalize !== undefined ? finalize() : (undefined as R);

        const tracer = this._app.tracer;
        if (tracer !== undefined) {
          // Tracing is not the hot path — keep it fully async (the span
          // wraps ONLY the onion; finalize runs after, still in scope).
          return (async () => {
            try {
              await tracer.startActiveSpan(this.__identity(ctx), {
                kind: this._spanKind,
                // deno-lint-ignore no-explicit-any
                parent: parent as any,
              }, async (span) => {
                // A named span alone is thin — stamp the low-cardinality
                // request attributes the recipes expect.
                if (attributes !== undefined) span.setAttributes(attributes);
                await chain(ctx, dispatch);
              });
            } catch (error) {
              disclose(error);
            }
            return await finish();
          })();
        }

        // No tracer: run the onion SYNCHRONOUSLY unless it (or the
        // handler) actually returns a promise. A bare sync handler with
        // no middleware finalizes without allocating a single request
        // promise — the whole point of R1.
        try {
          const ran = chain(ctx, dispatch);
          if (
            ran !== undefined &&
            typeof (ran as Promise<void>).then === 'function'
          ) {
            return (ran as Promise<void>).then(finish, (error) => {
              disclose(error);
              return finish();
            });
          }
        } catch (error) {
          disclose(error);
        }
        return finish();
      },
    );
  }
}

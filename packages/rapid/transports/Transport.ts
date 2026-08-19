import { ambient } from '@tundralibs/ambient';
import { SpanKind } from '@tundralibs/tracer';
import type { Application } from '../Application.ts';
import type { Context } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { compose } from '../utils/mod.ts';
import type { RapidContextState } from '../types/mod.ts';

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
   * middleware onion → `dispatch` innermost. Anything thrown lands as
   * a response OVERRIDE under the disclosure mode — full detail is
   * logged server-side, the context is ALWAYS respondable afterwards.
   */
  protected async _invoke<C extends Context<S, unknown>>(
    ctx: C,
    // Structural shape: universal middleware (context-union parameter)
    // and transport-scoped middleware (exactly C) both fit one chain.
    middlewares: readonly ((
      ctx: C,
      next: () => Promise<void>,
    ) => Promise<void>)[],
    dispatch: () => Promise<void>,
    parent?: unknown,
    attributes?: Record<string, string | number | boolean>,
  ): Promise<void> {
    await ambient.run(
      { requestId: ctx.requestId, action: ctx.action },
      async () => {
        try {
          const compose_ = compose<S, C>(middlewares);
          const tracer = this._app.tracer;
          if (tracer !== undefined) {
            await tracer.startActiveSpan(ctx.action, {
              kind: this._spanKind,
              // deno-lint-ignore no-explicit-any
              parent: parent as any,
            }, async (span) => {
              // A named span alone is thin — stamp the low-cardinality
              // request attributes the recipes expect.
              if (attributes !== undefined) span.setAttributes(attributes);
              await compose_(ctx, dispatch);
            });
          } else {
            await compose_(ctx, dispatch);
          }
        } catch (error) {
          const err = RapidError.from(error);
          this._app.log.error(err.message, {
            code: err.code,
            requestId: ctx.requestId,
            stack: err.stack,
            ...err.context.debug,
          });
          // The error-override path the response model was built for —
          // legal right up to respond(); echo headers survive. The
          // payload carries `requestId` so it appears in the BODY too,
          // consistent with the 404 shape (the header always has it).
          try {
            const payload = err.payload(this._app.mode);
            ctx.response = {
              status: err.status,
              content: typeof payload === 'object' && payload !== null
                ? { ...payload, requestId: ctx.requestId }
                : payload,
            };
          } catch {
            // The context was already finalized (a middleware called
            // respond() early). The committed response stands; there is
            // nothing to override. The failure is already logged above.
          }
        }
      },
    );
  }
}

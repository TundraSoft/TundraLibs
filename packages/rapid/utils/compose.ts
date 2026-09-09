// deno-lint-ignore-file require-await
/**
 * @fileoverview `compose` — the middleware-onion runner shared by every
 * transport's invocation cycle, decoupled for independent testing.
 *
 * @module
 */
import type { RapidContextState } from '../types/mod.ts';
import type { Context } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { isThenable } from './isThenable.ts';

/**
 * The callable shape `compose` runs — structural, so BOTH universal
 * middleware (accepting the context union) and transport-scoped
 * middleware (accepting exactly `C`) fit the same chain.
 */
type ComposableMiddleware<C> = (
  ctx: C,
  next: () => void | Promise<void>,
) => void | Promise<void>;

/**
 * Compose an onion of middleware into a single `(ctx, next)` runner. A
 * nullish slot is SKIPPED (it never aborts the chain).
 *
 * A middleware's OWN throw propagates unwrapped to the disclosure boundary
 * (`RapidError.from` classifies it — a guardian failure → 400, else 500);
 * `compose` never re-codes what flows through it. The one error it raises
 * itself is the `next()`-twice programmer bug below.
 *
 * @throws {@link RapidError} RAPID_UNHANDLED — rejects the runner's promise when
 *   a middleware calls `next()` more than once (a server bug; surfaces as 500).
 */
export const compose = <
  S extends RapidContextState,
  C extends Context<S, unknown>,
>(
  middleware: readonly ComposableMiddleware<C>[],
): (ctx: C, next: () => void | Promise<void>) => void | Promise<void> => {
  // Zero-middleware fast path: with no onion to run, the runner is just
  // "call the handler". Returning `next` directly avoids allocating the
  // per-call `dispatch`/`next` closures and the index bookkeeping the
  // general runner sets up on EVERY invocation — a cost a route/command/
  // job with no middleware (the common case) would otherwise pay for
  // nothing. The transports already cache this runner per registration,
  // so the saving lands once per request.
  if (middleware.length === 0) {
    return (_ctx: C, next: () => void | Promise<void>): void | Promise<void> =>
      next();
  }
  return async (ctx: C, next: () => void | Promise<void>) => {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        return Promise.reject(
          new RapidError('RAPID_UNHANDLED', {
            message: 'next() called multiple times — a middleware invoked ' +
              'next() more than once',
          }),
        );
      }
      index = i;
      let fn:
        | ComposableMiddleware<C>
        | (() => Promise<void>)
        | undefined = middleware[i];
      if (i === middleware.length) fn = next;
      // A nullish middleware slot is skipped, not treated as the end of
      // the chain — the handler still runs.
      if (!fn) return i < middleware.length ? dispatch(i + 1) : undefined;
      try {
        // A middleware that abandons next() (`void next()`, no return)
        // leaves the downstream promise unowned: a handler throw that
        // lands after the middleware returned would then be a
        // process-fatal unhandled rejection instead of a disclosed
        // response. Abandonment is DETECTED — the middleware's own result
        // settled while downstream was still pending — and only then is
        // the side handler attached (logged, never re-thrown: the response
        // is already finalized by then). A middleware that returns or
        // awaits next() receives the rejection itself, so a plain 4xx/5xx
        // flowing through it must NOT produce a log line.
        let downstream: Promise<void> | undefined;
        let downstreamSettled = false;
        const out = fn(ctx, function next() {
          downstream = dispatch(i + 1);
          downstream.then(
            () => {
              downstreamSettled = true;
            },
            () => {
              downstreamSettled = true;
            },
          );
          return downstream;
        });
        const check = (): void => {
          if (downstream === undefined || downstreamSettled) return;
          downstream.catch((error: unknown) => {
            // Structurally guarded: unit tests drive compose with bare
            // context doubles that carry no app.
            (ctx as Partial<Context<S, unknown>>).app?.log.warn(
              'a handler rejected after a middleware abandoned next() — return or await next()',
              {
                requestId: ctx.requestId,
                action: ctx.action,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          });
        };
        if (isThenable(out)) {
          return out.then(
            (value) => {
              check();
              return value as void;
            },
            (error: unknown) => {
              check();
              throw error;
            },
          );
        }
        check();
        return out;
      } catch (err) {
        return Promise.reject(err);
      }
    };

    return dispatch(0);
  };
};

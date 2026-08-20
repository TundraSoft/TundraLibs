// deno-lint-ignore-file require-await
/**
 * @fileoverview `compose` — the middleware-onion runner shared by every
 * transport's invocation cycle, decoupled for independent testing.
 *
 * @module
 */
import type { RapidContextState } from '../types/mod.ts';
import type { Context } from '../context/mod.ts';

/**
 * The callable shape `compose` runs — structural, so BOTH universal
 * middleware (accepting the context union) and transport-scoped
 * middleware (accepting exactly `C`) fit the same chain.
 */
type ComposableMiddleware<C> = (
  ctx: C,
  next: () => Promise<void>,
) => Promise<void>;

/**
 * Compose an onion of middleware into a single `(ctx, next)` runner. A
 * nullish slot is SKIPPED (it never aborts the chain).
 *
 * @throws {Error} As a REJECTION of the runner's promise when one
 *   middleware calls `next()` more than once (a plain `Error` — the
 *   shared cycle wraps it into the RAPID_UNHANDLED disclosure path).
 */
export const compose = <
  S extends RapidContextState,
  C extends Context<S, unknown>,
>(
  middleware: readonly ComposableMiddleware<C>[],
): (ctx: C, next: () => Promise<void>) => Promise<void> => {
  // Zero-middleware fast path: with no onion to run, the runner is just
  // "call the handler". Returning `next` directly avoids allocating the
  // per-call `dispatch`/`next` closures and the index bookkeeping the
  // general runner sets up on EVERY invocation — a cost a route/command/
  // job with no middleware (the common case) would otherwise pay for
  // nothing. The transports already cache this runner per registration,
  // so the saving lands once per request.
  if (middleware.length === 0) {
    return (_ctx: C, next: () => Promise<void>): Promise<void> => next();
  }
  return async (ctx: C, next: () => Promise<void>) => {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
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
        return fn(ctx, function next() {
          return dispatch(i + 1);
        });
      } catch (err) {
        return Promise.reject(err);
      }
    };

    return dispatch(0);
  };
};

/**
 * @fileoverview {@link RapidModuleInvokeMiddleware} — the onion a
 * `@Use`-decorated method runs through when INVOKED (never when called
 * as a plain method). Same `(ctx, next)` contract as rAPId's transport
 * middleware; may be sync. ALWAYS `return next()` (or `await` it) —
 * a bare `next();` statement detaches the call and the invocation
 * finishes before the method does.
 *
 * @module
 */

import type { InvokeContext } from '../InvokeContext.ts';

/** Middleware over an {@link InvokeContext}. */
export type RapidModuleInvokeMiddleware = (
  ctx: InvokeContext,
  next: () => void | Promise<void>,
) => void | Promise<void>;

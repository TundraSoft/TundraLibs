/**
 * @fileoverview {@link RapidModuleInvokeMiddleware} — the onion a
 * `@Use`-decorated method runs through when INVOKED (not when called as
 * a plain method). Same `(ctx, next)` contract as rAPId's transport
 * middleware; may be sync.
 *
 * @module
 */

import type { InvokeContext } from '../contexts.ts';

/** Middleware over an {@link InvokeContext}. */
export type RapidModuleInvokeMiddleware = (
  ctx: InvokeContext,
  next: () => void | Promise<void>,
) => void | Promise<void>;

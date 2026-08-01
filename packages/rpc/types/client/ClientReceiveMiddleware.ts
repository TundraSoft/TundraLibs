import type { ClientReceiveContext } from './ClientReceiveContext.ts';

/**
 * Middleware that wraps every inbound frame. Call `next()` to
 * pass control to the next middleware (or to the built-in
 * dispatch — id correlation for `result`, subscription routing
 * for `msg`, …). Skip `next()` to drop the frame.
 */
export type ClientReceiveMiddleware = (
  ctx: ClientReceiveContext,
  next: () => Promise<void>,
) => Promise<void>;

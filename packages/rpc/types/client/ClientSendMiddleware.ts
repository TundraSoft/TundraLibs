import type { ClientSendContext } from './ClientSendContext.ts';

/**
 * Middleware that wraps every outbound frame. Call `next()` to
 * pass control to the next middleware (or to the actual
 * `ws.send`); skip `next()` to short-circuit (e.g. refuse to
 * send). Throwing rejects the awaiting `client.command(...)` /
 * etc. with the same error.
 */
export type ClientSendMiddleware = (
  ctx: ClientSendContext,
  next: () => Promise<void>,
) => Promise<void>;

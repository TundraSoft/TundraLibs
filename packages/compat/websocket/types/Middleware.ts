import type { MessageContext } from './MessageContext.ts';

/**
 * Koa-style middleware that wraps every incoming message. Call
 * `next()` to delegate to the next middleware (or the terminal
 * `onMessage` handler when last in the chain). Skip `next()` to
 * short-circuit. Errors thrown propagate to the configured
 * `onError` handler (or are swallowed when none is set).
 *
 * @typeParam T - Connection data type.
 * @typeParam M - Decoded message type.
 */
export type Middleware<T = unknown, M = string> = (
  ctx: MessageContext<T, M>,
  next: () => Promise<void>,
) => Promise<void> | void;

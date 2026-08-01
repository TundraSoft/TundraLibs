import type { CommandContext } from './CommandContext.ts';

/**
 * Koa-style middleware that wraps command execution. Call `next()`
 * to pass control to the next middleware (or the handler when last
 * in the chain). Skip `next()` to short-circuit. Errors thrown
 * propagate to the client as a `result` frame with `ok: false`.
 *
 * @typeParam T - Connection data type.
 */
export type Middleware<T = unknown> = (
  ctx: CommandContext<T, unknown>,
  next: () => Promise<void>,
) => Promise<void>;

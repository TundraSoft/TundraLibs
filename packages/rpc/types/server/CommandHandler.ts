import type { CommandContext } from './CommandContext.ts';

/**
 * Command handler — produces the value sent back to the client in
 * the `result` frame's `data` field.
 *
 * @typeParam T - Connection data type.
 * @typeParam P - Validated payload type.
 * @typeParam R - Result type.
 */
export type CommandHandler<T = unknown, P = unknown, R = unknown> = (
  ctx: CommandContext<T, P>,
) => R | Promise<R>;

/**
 * @fileoverview `@SOCKET` — declare a module method as a websocket
 * COMMAND. Metadata-only, same contract as the HTTP decorators (see
 * `http.ts`): records a {@link RapidDecoration}, never wraps.
 *
 * @module
 */

import type { RapidBinds, RapidModuleReply } from '../types/mod.ts';
import { assertMethodContext, recordDecoration } from './registry.ts';

/** Options for {@link SOCKET}. */
export type SocketDecoratorOptions<A extends readonly unknown[]> = {
  /** Argument binders, in method-parameter order (see `http.ts`). */
  bind?: RapidBinds<A>;
};

/** The decorator signature the factory returns. */
type SocketDecorator<This, A extends readonly unknown[]> = (
  target: (this: This, ...args: A) => RapidModuleReply,
  context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: A) => RapidModuleReply
  >,
) => void;

/**
 * Declare the decorated method as a websocket command. The SAME
 * method may also carry `@GET`/`@JOB` — one implementation, several
 * transports; each decorator contributes its own binds.
 *
 * OVERLOADED: without `bind` the method must take NO parameters —
 * otherwise `A` would infer from the method's own signature and the
 * parameter check would silently vanish (see `http.ts`).
 *
 * @throws {RapidError} RAPID_CONFIG at decoration time under legacy
 *   decorator compilation, or on a non-method/static/private target.
 */
export const SOCKET: {
  <This>(command: string): SocketDecorator<This, []>;
  <This, A extends readonly unknown[]>(
    command: string,
    options: SocketDecoratorOptions<A> & { bind: RapidBinds<A> },
  ): SocketDecorator<This, A>;
} = (
  command: string,
  options: SocketDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => {
  return (
    _target: object,
    context: ClassMethodDecoratorContext,
  ): void => {
    assertMethodContext(context, 'SOCKET');
    recordDecoration(context, {
      kind: 'SOCKET',
      command,
      binds: options.bind ?? [],
      methodName: String(context.name),
    });
  };
};

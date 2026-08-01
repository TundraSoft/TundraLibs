import type { InboundFrame } from '../protocol/InboundFrame.ts';

/**
 * Per-send middleware context — passed to `client.useSend()`
 * middleware around every outbound `cmd` / `sub` / `unsub` / `pub`
 * frame.
 *
 * The middleware can mutate `frame` (typical use: inject auth
 * tokens into command payloads), short-circuit before `next()`, or
 * wrap `next()` with timing / logging / retry logic.
 */
export type ClientSendContext = {
  /** The outbound frame about to be written to the wire. Mutable. */
  frame: InboundFrame;
  /**
   * Mutable per-send state shared across the middleware chain.
   * Use this for cross-cutting concerns (request id, timing, auth
   * state).
   */
  state: Record<string, unknown>;
};

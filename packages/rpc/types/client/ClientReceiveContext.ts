import type { OutboundFrame } from '../protocol/OutboundFrame.ts';

/**
 * Per-receive middleware context — passed to `client.useReceive()`
 * middleware around every inbound frame from the server.
 *
 * The middleware runs **before** request correlation kicks in for
 * `result` frames, so it sees every wire-level frame the server
 * sends. Typical uses: server-push frame routing, structured
 * logging of inbound traffic, anomaly detection.
 */
export type ClientReceiveContext = {
  /** The inbound frame just received from the server. Mutable. */
  frame: OutboundFrame;
  /** Mutable per-receive state shared across the middleware chain. */
  state: Record<string, unknown>;
};

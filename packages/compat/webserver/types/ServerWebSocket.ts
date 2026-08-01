import type { WebSocketData } from './WebSocketData.ts';

/**
 * Server-side WebSocket. Same shape across Bun, Deno, and Node
 * (`ws`).
 *
 * @typeParam T - Custom per-connection state set by the upgrade
 *   hook (defaults to `unknown` when no hook is set).
 */
export type ServerWebSocket<T = unknown> = {
  send(data: WebSocketData): void;
  close(code?: number, reason?: string): void;
  /** Returns `false` if the runtime can't surface ping/pong. */
  ping(data?: WebSocketData): boolean;
  /** Returns `false` if the runtime can't surface ping/pong. */
  pong(data?: WebSocketData): boolean;
  readonly readyState: number;
  /**
   * Bytes still queued for the wire. A steadily growing value
   * indicates the consumer is slower than the producer
   * (backpressure).
   */
  readonly bufferedAmount: number;
  /** Negotiated subprotocol, or `''` if none. Picked at upgrade time. */
  readonly protocol: string;
  /** Custom per-connection state — see `UpgradeDecision`. */
  data: T;
  remoteAddress?: string;
};

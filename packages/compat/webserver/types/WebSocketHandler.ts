import type { ServerWebSocket } from './ServerWebSocket.ts';
import type { UpgradeDecision } from './UpgradeDecision.ts';
import type { WebSocketData } from './WebSocketData.ts';
import type { WebSocketUpgradeContext } from './WebSocketUpgradeContext.ts';

/**
 * Lifecycle callbacks for server WebSockets.
 *
 * ## Runtime support
 *
 * | Handler  | Bun   | Deno  | Node | Notes                                                              |
 * | -------- | ----- | ----- | ---- | ------------------------------------------------------------------ |
 * | upgrade  | ✅    | ✅    | ✅   | Accept / refuse / customize per-request                            |
 * | open     | ✅    | ✅    | ✅   |                                                                    |
 * | message  | ✅    | ✅    | ✅   |                                                                    |
 * | close    | ✅    | ✅    | ✅   |                                                                    |
 * | error    | ✅\*  | ✅    | ✅   | Bun has no native error event — we synthesize from caught throws   |
 * | ping     | ✅    | ❌\** | ✅   | Deno consumes ping/pong frames internally — unreachable            |
 * | pong     | ✅    | ❌\** | ✅   | (same)                                                             |
 * | drain    | ✅    | ✅\†  | ✅   | Deno emulated by polling `bufferedAmount`                          |
 *
 * @typeParam T - Per-connection data type.
 */
export type WebSocketHandler<T = unknown> = {
  /**
   * Run before the handshake completes. Lets you authenticate,
   * pick a subprotocol, or attach typed connection state. Omit to
   * accept every upgrade unconditionally.
   *
   * @param request - The HTTP upgrade request.
   * @param info    - Client address/port.
   * @returns {@link UpgradeDecision}.
   */
  upgrade?: (
    request: Request,
    info: { remoteAddress: string | null; remotePort: number | null },
  ) => UpgradeDecision<T> | Promise<UpgradeDecision<T>>;

  open?: (
    ws: ServerWebSocket<T>,
    context: WebSocketUpgradeContext,
  ) => void | Promise<void>;

  message?: (
    ws: ServerWebSocket<T>,
    message: WebSocketData,
  ) => void | Promise<void>;

  close?: (
    ws: ServerWebSocket<T>,
    code: number,
    reason: string,
  ) => void | Promise<void>;

  error?: (
    ws: ServerWebSocket<T>,
    error: Error,
  ) => void | Promise<void>;

  ping?: (
    ws: ServerWebSocket<T>,
    data: Uint8Array,
  ) => void | Promise<void>;

  pong?: (
    ws: ServerWebSocket<T>,
    data: Uint8Array,
  ) => void | Promise<void>;

  /** Fires when `bufferedAmount` drains to 0. See the support matrix above. */
  drain?: (ws: ServerWebSocket<T>) => void | Promise<void>;

  /** Idle timeout in seconds; `0` disables. @default 120 */
  idleTimeout?: number;
};

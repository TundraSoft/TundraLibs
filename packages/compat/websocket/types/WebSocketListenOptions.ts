/**
 * Standalone listen options — used by `WebSocketServer.listen`.
 */
export type WebSocketListenOptions = {
  port: number;
  hostname?: string;
  /**
   * Fallback HTTP handler. Receives any request that isn't a
   * WebSocket upgrade. Defaults to a 404.
   */
  httpHandler?: (req: Request) => Response | Promise<Response>;
};

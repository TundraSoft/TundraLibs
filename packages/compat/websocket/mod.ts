/**
 * @fileoverview `@tundralibs/compat/websocket` entry point.
 *
 * Exports the {@link WebSocketServer} primitive — middleware-aware
 * WebSocket server with a pluggable codec, connection-level lifecycle
 * hooks, broadcast, and connection iteration.
 *
 * For an opinionated RPC + pub/sub layer (command router, channels,
 * id-correlated requests, pluggable adapter for cross-process
 * broadcast), see `@tundralibs/rpc`.
 *
 * @module
 *
 * @example Standalone echo server
 * ```ts
 * import { WebSocketServer } from '@tundralibs/compat/websocket';
 *
 * const wss = new WebSocketServer();
 * wss.onMessage((ctx) => ctx.ws.send(`echo: ${ctx.message}`));
 * await wss.listen({ port: 8080 });
 * ```
 *
 * @example JSON codec + middleware
 * ```ts
 * import { JsonCodec, WebSocketServer } from '@tundralibs/compat/websocket';
 *
 * const wss = new WebSocketServer({ codec: JsonCodec });
 * wss.use(async (ctx, next) => {
 *   console.log('rx', ctx.message);
 *   await next();
 * });
 * wss.onMessage((ctx) => {
 *   wss.broadcast({ echo: ctx.message });
 * });
 * await wss.listen({ port: 8080 });
 * ```
 *
 * @example Mounted alongside HTTP routes
 * ```ts
 * import { WebServer } from '@tundralibs/compat/webserver';
 * import { WebSocketServer } from '@tundralibs/compat/websocket';
 *
 * const wss = new WebSocketServer();
 * wss.onMessage((ctx) => ctx.ws.send(`echo: ${ctx.message}`));
 *
 * const server = new WebServer('API', {
 *   mode: 'TCP',
 *   port: 8080,
 *   handler: () => new Response('hello'),
 *   websocket: wss.handlers(),
 * });
 * await server.start();
 * ```
 */

export { WebSocketServer } from './WebSocketServer.ts';
export { BinaryCodec, JsonCodec, StringCodec } from './codecs.ts';
export type {
  Codec,
  DecodeErrorReason,
  MessageContext,
  Middleware,
  WebSocketListenOptions,
  WebSocketServerOptions,
} from './types/mod.ts';

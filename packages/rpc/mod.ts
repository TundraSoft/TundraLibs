/**
 * @fileoverview `@tundralibs/rpc` entry point.
 *
 * Exports the {@link Server} and {@link Client} classes — RPC +
 * pub/sub framework over WebSocket — along with their supporting
 * types, the wire-protocol codec, and the default in-memory pub/sub
 * adapter. Cross-process broadcast adapters (Redis, etc.) are out of
 * scope here; plug your own implementation of {@link PubSubAdapter}
 * into `new Server({ pubsub: ... })`. To verify such an adapter
 * against the contract, import `runAdapterConformance` from the
 * `@tundralibs/rpc/conformance` sub-path — it is kept off this barrel
 * because it pulls in a test framework, which browser and edge-worker
 * bundlers cannot resolve.
 *
 * `Server` and `Client` share a single wire protocol and a parallel
 * middleware mental model (`use` on Server, `useSend` / `useReceive`
 * on Client). The protocol layer ({@link encodeFrame} /
 * {@link decodeFrame}) is shared too, so a third-party implementation
 * of either side can interop bidirectionally.
 *
 * Built on top of `@tundralibs/compat/websocket`'s
 * {@link WebSocketServer} primitive — Server adds command dispatch,
 * channels, and the JSON wire envelope; the primitive provides
 * cross-runtime WebSocket lifecycle, middleware, and codec hooks.
 *
 * @module
 *
 * @example Standalone server
 * ```ts
 * import { Server } from '@tundralibs/rpc';
 *
 * const server = new Server();
 * server.command('echo', undefined, (ctx) => ctx.payload);
 * await server.listen({ port: 8080 });
 * ```
 *
 * @example Client connecting to that server
 * ```ts
 * import { Client } from '@tundralibs/rpc';
 *
 * const client = new Client({ url: 'ws://localhost:8080' });
 * await client.connect();
 * const out = await client.command('echo', { text: 'hello' });
 * console.log(out); // { text: 'hello' }
 * await client.close();
 * ```
 *
 * @example Mounted into an existing WebServer
 * ```ts
 * import { WebServer } from '@tundralibs/compat/webserver';
 * import { Server } from '@tundralibs/rpc';
 *
 * const rpc = new Server();
 * rpc.command('echo', undefined, (ctx) => ctx.payload);
 *
 * const web = new WebServer('API', {
 *   mode: 'TCP',
 *   port: 8080,
 *   handler: () => new Response('hello'),
 *   websocket: rpc.handlers(),
 * });
 * await web.start();
 * ```
 */

export { Server } from './Server.ts';
export { Client } from './Client.ts';

export {
  RpcConfigError,
  RpcError,
  RpcRegistrationError,
  RpcStateError,
} from './errors/mod.ts';

export {
  type AdapterCapabilities,
  MemoryPubSubAdapter,
  PubSubAdapter,
  type Subscription,
} from './pubsub/mod.ts';

export { decodeFrame, encodeFrame } from './protocol.ts';

export type {
  BackpressureHandler,
  ChannelContext,
  ChannelOptions,
  ClientOptions,
  ClientReceiveContext,
  ClientReceiveMiddleware,
  ClientSendContext,
  ClientSendMiddleware,
  ClientState,
  ClientSubscription,
  CommandContext,
  CommandFrame,
  CommandHandler,
  InboundFrame,
  ListenOptions,
  MessageFrame,
  Middleware,
  OutboundFrame,
  PublishFrame,
  ReconnectPolicy,
  ResultFrame,
  ServerErrorFrame,
  ServerOptions,
  SubscribedFrame,
  SubscribeFrame,
  UnsubscribeFrame,
  Validator,
} from './types/mod.ts';

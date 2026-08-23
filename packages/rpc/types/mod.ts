/**
 * @fileoverview RPC type surface — single barrel over the
 * `protocol/`, `server/`, and `client/` sub-folders.
 *
 * @module
 */

// protocol/ — wire-protocol JSON envelope frames.
export type {
  CommandFrame,
  InboundFrame,
  MessageFrame,
  OutboundFrame,
  PublishFrame,
  ResultFrame,
  ServerErrorFrame,
  SubscribedFrame,
  SubscribeFrame,
  UnsubscribeFrame,
} from './protocol/mod.ts';

// server/ — application-level types for the Server.
export type {
  BackpressureHandler,
  ChannelContext,
  ChannelOptions,
  CommandContext,
  CommandHandler,
  ListenOptions,
  Middleware,
  SendErrorHandler,
  ServerOptions,
  Validator,
} from './server/mod.ts';

// client/ — application-level types for the Client.
export type {
  ClientOptions,
  ClientReceiveContext,
  ClientReceiveMiddleware,
  ClientSendContext,
  ClientSendMiddleware,
  ClientState,
  ClientSubscription,
  ReconnectPolicy,
} from './client/mod.ts';

/**
 * @fileoverview WebServer module exports.
 *
 * Re-exports the {@link WebServer} class, all server-related types,
 * and error classes for the cross-runtime HTTP/HTTPS server.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { WebServer } from '@tundralibs/compat/webserver';
 *
 * const server = new WebServer('MyAPI', {
 *   mode: 'TCP',
 *   port: 3000,
 *   handler: (req) => new Response('OK'),
 * });
 * await server.start();
 * ```
 */

export type {
  RequestInfo,
  ServerEvents,
  ServerHandler,
  ServerMetrics,
  ServerMode,
  ServerOptions,
  ServerState,
  ServerWebSocket,
  UpgradeDecision,
  WebSocketData,
  WebSocketHandler,
  WebSocketReadyState,
  WebSocketUpgradeContext,
} from './types/mod.ts';
export {
  ServerAlreadyRunningError,
  ServerConfigurationError,
  ServerError,
  ServerNotRunningError,
  ServerPermissionError,
} from './Error.ts';
export { WebServer } from './WebServer.ts';

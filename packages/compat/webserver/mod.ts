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
  WebSocketUpgradeContext,
} from './types/mod.ts';
// `WebSocketReadyState` is a real `const` object (numeric readyState
// values), not a type — re-exporting it via `export type` would erase
// it, leaving consumers with no way to read `.OPEN`/`.CLOSED`/etc. at
// runtime.
export { WebSocketReadyState } from './types/mod.ts';
export {
  ServerAlreadyRunningError,
  ServerConfigurationError,
  ServerError,
  ServerNotRunningError,
  ServerPermissionError,
} from './Error.ts';
export { WebServer } from './WebServer.ts';

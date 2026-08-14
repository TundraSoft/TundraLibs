/**
 * @fileoverview Server type exports.
 *
 * Re-exports all server-related types from a single entry point.
 * Import from this module for convenience.
 *
 * @module
 *
 * @example
 * ```typescript
 * import type {
 *   ServerOptions,
 *   ServerHandler,
 *   ServerEvents,
 *   ServerMetrics,
 *   ServerMode,
 *   ServerState,
 *   ServerWebSocket,
 *   WebSocketHandler,
 * } from '@tundralibs/compat/webserver';
 * ```
 */

export type { ServerEvents } from './ServerEvents.ts';
export type { ServerMetrics } from './ServerMetrics.ts';
export type { ServerMode } from './ServerMode.ts';
export type { ServerOptions } from './ServerOptions.ts';
export type { RequestInfo } from './RequestInfo.ts';
export type { ServerHandler } from './ServerHandler.ts';
export type { ServerState } from './ServerState.ts';
export type { ServerWebSocket } from './ServerWebSocket.ts';
export type { UpgradeDecision } from './UpgradeDecision.ts';
export type { WebSocketData } from './WebSocketData.ts';
export type { WebSocketHandler } from './WebSocketHandler.ts';
export { WebSocketReadyState } from './WebSocketReadyState.ts';
export type { WebSocketUpgradeContext } from './WebSocketUpgradeContext.ts';

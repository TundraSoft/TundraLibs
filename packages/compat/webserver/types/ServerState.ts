/**
 * @fileoverview Server state type definition.
 *
 * Defines the lifecycle states of the server.
 *
 * @module
 */

/**
 * Server lifecycle state.
 *
 * State transitions:
 * ```
 * STOPPED ─[start()]─► STARTING ─► RUNNING ─[stop()]─► STOPPING ─► STOPPED
 *                           │                              ▲
 *                           └──────[error]─────────────────┘
 * ```
 *
 * - **STOPPED**: Initial state and state after graceful shutdown
 *   - Server is not accepting connections
 *   - Safe to call `start()`
 *   - Calling `stop()` throws {@link ServerNotRunningError}
 *
 * - **STARTING**: Transitional state during server initialization
 *   - Binding to port/socket in progress
 *   - TLS certificates being loaded
 *   - UNIX socket file being created
 *
 * - **RUNNING**: Server is active and accepting connections
 *   - Requests are being processed
 *   - Metrics are being collected
 *   - Safe to call `stop()`
 *   - Calling `start()` throws {@link ServerAlreadyRunningError}
 *
 * - **STOPPING**: Transitional state during shutdown
 *   - No new connections accepted
 *   - Active requests completing
 *   - UNIX socket file being cleaned up
 *
 * @example
 * ```typescript
 * const server = new WebServer('MyServer', options);
 *
 * console.log(server.state); // 'STOPPED'
 *
 * await server.start();
 * console.log(server.state); // 'RUNNING'
 *
 * await server.stop();
 * console.log(server.state); // 'STOPPED'
 * ```
 */
export type ServerState = 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED';

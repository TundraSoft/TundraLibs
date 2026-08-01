/**
 * @fileoverview Server mode type definition.
 *
 * Defines the connection modes supported by the server.
 *
 * @module
 */

/**
 * Server connection mode.
 *
 * Determines how clients connect to the server:
 *
 * - **TCP**: Standard TCP/IP networking over hostname:port
 *   - Accessible over network (LAN, WAN, Internet)
 *   - Supports TLS/HTTPS for encrypted connections
 *   - Cross-platform compatible
 *
 * - **UNIX**: UNIX domain socket via file path
 *   - Local-only connections (same machine)
 *   - Lower latency than TCP for local IPC
 *   - File-based permissions for access control
 *   - Socket file automatically cleaned up on stop
 *   - **Not supported on Windows**
 *
 * @example TCP mode
 * ```typescript
 * const server = new WebServer('API', {
 *   mode: 'TCP',
 *   port: 8080,
 *   hostname: '0.0.0.0',
 *   handler: (req) => new Response('OK'),
 * });
 * ```
 *
 * @example UNIX mode (Linux/macOS only)
 * ```typescript
 * const server = new WebServer('API', {
 *   mode: 'UNIX',
 *   unixSocketPath: '/var/run/myapp.sock',
 *   handler: (req) => new Response('OK'),
 * });
 * ```
 */
export type ServerMode = 'TCP' | 'UNIX';

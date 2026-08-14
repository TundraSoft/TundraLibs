/**
 * @fileoverview Cross-runtime HTTP/HTTPS server implementation.
 *
 * This module provides a unified server abstraction that works across
 * Bun, Deno, and Node.js runtimes. It handles the differences between
 * runtime APIs while exposing a consistent interface.
 *
 * Features:
 * - TCP (HTTP/HTTPS) and UNIX socket modes
 * - TLS/HTTPS support with file or string certificates
 * - WebSocket support (Bun + Deno native, Node.js via `ws` npm package)
 * - Request metrics and analytics
 * - Event-driven architecture for logging/monitoring
 * - Graceful shutdown with connection draining
 *
 * @module
 *
 * @example Basic HTTP server
 * ```typescript
 * import { WebServer } from '@tundralibs/compat/webserver';
 *
 * const server: WebServer = new WebServer('MyAPI', {
 *   mode: 'TCP',
 *   port: 8080,
 *   handler: (request, info) => {
 *     return new Response(`Hello from ${info.requestId}`);
 *   },
 * });
 *
 * server.on('onStart', (name, mode) => {
 *   console.log(`${name} started on ${server.address}`);
 * });
 *
 * server.start();
 * ```
 *
 * @example HTTPS server with WebSocket
 * ```typescript
 * const server = new WebServer('SecureAPI', {
 *   mode: 'TCP',
 *   port: 443,
 *   tls: {
 *     certFile: './cert.pem',
 *     keyFile: './key.pem',
 *   },
 *   handler: (request, info) => new Response('OK'),
 *   websocket: {
 *     open: (ws) => console.log('Client connected'),
 *     message: (ws, data) => ws.send(`Echo: ${data}`),
 *     close: (ws, code, reason) => console.log('Client left'),
 *   },
 * });
 *
 * server.start();
 * ```
 */

import { Bun, loadBuiltin } from '../_runtime-globals.ts';

import { isNode, RUNTIME } from '../runtime.ts';
import { isFileSync, pathExistsSync, removeSync } from '../file.ts';
import * as path from '../path.ts';
import {
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
  FetchTLSError,
  type TLSOptions,
  type ValidatedTLS,
  validateTLS,
  validateTLSContent,
} from '../common.ts';
import type {
  RequestInfo,
  ServerEvents,
  ServerMetrics,
  ServerMode,
  ServerOptions,
  ServerState,
  ServerWebSocket,
  UpgradeDecision,
  WebSocketData,
  WebSocketUpgradeContext,
} from './types/mod.ts';
import {
  ServerAlreadyRunningError,
  ServerConfigurationError,
  ServerError,
  ServerNotRunningError,
  ServerPermissionError,
} from './Error.ts';
import { UnsupportedRuntimeError } from '../Error.ts';
import { hasPermissionSync } from '../permissions.ts';
// Local aliases for runtime-only types — see _runtime-globals.ts. Using
// `any` decouples us from Deno's lib types (no clash on the consumer
// side) and from `@types/bun` (which we deliberately don't pull in).
// deno-lint-ignore no-explicit-any
type BunServer = any;
// deno-lint-ignore no-explicit-any
type BunServerWebSocket<_T = any> = any;
// deno-lint-ignore no-explicit-any
type DenoServeHandlerInfo = any;

// Node.js built-ins, resolved synchronously through
// `process.getBuiltinModule` (see {@link loadBuiltin}) — never with a
// top-level `await import()`, which would make bundlers lower every
// consumer module to an async initializer and deadlock legal circular
// imports.
// Bun and Deno serve through their own APIs, so only Node loads these.
const nodeHttp: typeof import('node:http') = loadBuiltin('node:http', isNode);
const nodeHttps: typeof import('node:https') = loadBuiltin(
  'node:https',
  isNode,
);

/**
 * `ws` is the de-facto Node WebSocket implementation; pure-JS, no native
 * deps. It is an npm package rather than a built-in, so a dynamic import
 * is the only way to reach it — and that import must stay inside the async
 * server-start path. At module scope it would both reintroduce top-level
 * await and break runtimes that merely *look* like Node: Cloudflare
 * Workers exposes `process.versions.node`, so an eval-time load there
 * would fail for every consumer importing the compat barrel.
 *
 * The promise is memoized, so the module is fetched once no matter how
 * many servers start.
 */
let nodeWsLoad: Promise<typeof import('ws')> | undefined;
const loadNodeWs = (): Promise<
  typeof import('ws')
> => (nodeWsLoad ??= import('ws'));

/** Minimal shape of a Deno HTTP server handle (avoids `typeof Deno` in public types). */
type _DenoServerHandle = {
  ref(): void;
  unref(): void;
  shutdown(): Promise<void>;
  finished: Promise<void>;
};

/** Minimal shape of a Bun HTTP server handle (avoids `typeof Bun` in public types). */
type _BunServerHandle = {
  ref(): void;
  unref(): void;
  stop(force?: boolean): Promise<void>;
};

/**
 * Bun's `ws.data` payload — wraps the user's `T` alongside the
 * upgrade context and chosen subprotocol so all three are reachable
 * inside the Bun event handlers (which only receive `ws`). The Bun
 * wrapper's `data` getter projects `userData` back out as `T`.
 */
type _BunWsData<T> = {
  userData: T;
  upgradeContext: WebSocketUpgradeContext;
  protocol: string;
};

/**
 * Per-runtime hooks the public lifecycle methods dispatch through.
 *
 * Each runtime (Bun, Deno, Node) supplies an implementation built
 * once on first use and cached. The public `start` / `stop` / `ref` /
 * `unref` methods compose the adapter calls with shared concerns
 * (state machine, abort-signal wiring, UNIX socket cleanup, error
 * wrapping, event emission) so those concerns live in one place
 * instead of being repeated across the runtime branches.
 *
 * @internal
 */
type _RuntimeAdapter = {
  start(): Promise<void>;
  stop(graceful: boolean): Promise<void>;
  ref(): void;
  unref(): void;
};

/**
 * Discriminated union returned by {@link WebServer._resolveUpgrade}.
 * Either the upgrade was rejected (caller falls through to HTTP) or
 * the resolved upgrade carries the user-supplied `T`, the chosen
 * subprotocol, optional response headers, and the upgrade context.
 */
type _ResolvedUpgrade<T> =
  | { accepted: false }
  | {
    accepted: true;
    userData: T;
    protocol: string;
    extraHeaders: HeadersInit | undefined;
    upgradeContext: WebSocketUpgradeContext;
  };

/**
 * Best-effort stringification of an unknown thrown value. Used to
 * synthesize an `Error` when a non-Error is thrown from a user
 * handler.
 */
const _stringifyThrown = (err: unknown): string => {
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);
  try {
    return JSON.stringify(err);
  } catch {
    return `<non-serializable thrown of type ${typeof err}>`;
  }
};

/**
 * Cross-runtime HTTP/HTTPS server with WebSocket support.
 *
 * Provides a unified API for creating HTTP servers that work across
 * Bun, Deno, and Node.js runtimes. Automatically handles runtime-specific
 * differences in APIs while exposing consistent behavior.
 *
 * ## Lifecycle
 *
 * ```
 * new WebServer() ─► start() ─► [RUNNING] ─► stop() ─► [STOPPED]
 *                   │                        │
 *                   └──[events fire]─────────┘
 * ```
 *
 * ## Runtime Compatibility
 *
 * | Feature          | Bun | Deno | Node.js |
 * |-----------------|-----|------|---------|
 * | HTTP/HTTPS      | ✅  | ✅   | ✅      |
 * | UNIX sockets    | ✅  | ✅   | ✅      |
 * | WebSocket       | ✅  | ✅   | ✅*     |
 * | Backlog option  | ❌  | ✅   | ✅      |
 * | ReusePort       | ❌  | ✅   | ✅      |
 *
 * *Node.js WebSocket is provided via the `ws` npm package, loaded
 * lazily on first use; Bun and Deno use their native implementations.
 *
 * @example TCP server with metrics monitoring
 * ```typescript
 * const server: WebServer = new WebServer('API', {
 *   mode: 'TCP',
 *   port: 3000,
 *   handler: async (req, info): Promise<Response> => {
 *     const url = new URL(req.url);
 *     if (url.pathname === '/metrics') {
 *       return Response.json(server.metrics);
 *     }
 *     return new Response('OK');
 *   },
 * });
 *
 * server.on('onResponse', (name, req, info, res) => {
 *   console.log(`[${name}] ${req.method} ${req.url} → ${res.status}`);
 * });
 *
 * server.start();
 * ```
 *
 * @example UNIX socket server
 * ```typescript
 * const server = new WebServer('LocalAPI', {
 *   mode: 'UNIX',
 *   unixSocketPath: '/var/run/myapp.sock',
 *   handler: (req) => new Response('OK'),
 * });
 *
 * server.start();
 * // Connect via: curl --unix-socket /var/run/myapp.sock http://localhost/
 * ```
 *
 * @see {@link ServerOptions} for configuration options
 * @see {@link ServerEvents} for available events
 * @see {@link ServerMetrics} for metrics structure
 */
export class WebServer<T = unknown> {
  /**
   * The server's connection mode (TCP or UNIX).
   * Determined by the `mode` option passed to constructor.
   * @see {@link ServerMode}
   */
  public readonly mode: ServerMode;

  /**
   * The server's unique name.
   * Used in event callbacks and logging. Trimmed of whitespace.
   */
  public readonly name: string;

  /**
   * The complete server configuration options.
   * For TCP mode, includes defaults applied (port: 8008, hostname: 'localhost').
   * @see {@link ServerOptions}
   */
  public readonly options: ServerOptions<ServerMode, T>;

  /**
   * Internal state storage for server lifecycle.
   * @internal
   */
  protected _state: ServerState = 'STOPPED';

  /**
   * Current server lifecycle state.
   *
   * Possible values:
   * - `'STOPPED'` - Server is not running (initial state)
   * - `'STARTING'` - Server is initializing
   * - `'RUNNING'` - Server is accepting connections
   * - `'STOPPING'` - Server is shutting down
   *
   * @see {@link ServerState}
   */
  public get state(): ServerState {
    return this._state;
  }

  /**
   * Internal metrics storage.
   * @internal
   */
  protected _metrics: ServerMetrics = {
    requests: {
      total: 0,
      active: 0,
      peakActive: 0,
    },
    statusCodes: {
      '1xx': 0,
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    },
    responseTime: {
      min: Infinity,
      max: 0,
      average: 0,
    },
    websocket: {
      upgrades: 0,
      connections: {
        total: 0,
        active: 0,
        peakActive: 0,
      },
      messages: {
        received: 0,
        sent: 0,
      },
      errors: 0,
      connectionDuration: {
        min: Infinity,
        max: 0,
        average: 0,
      },
    },
  };

  /**
   * Running sum of all response times for accurate average calculation.
   * @internal
   */
  protected _totalResponseTime = 0;

  /**
   * Running sum of all WebSocket connection durations.
   * @internal
   */
  protected _totalConnectionDuration = 0;

  /**
   * Count of *closed* WebSocket connections whose duration has been
   * accumulated into {@link _totalConnectionDuration}. Used as the
   * divisor for `connectionDuration.average` — dividing by
   * `connections.total` (which counts opens, never decremented) would
   * understate the average while connections are still open.
   * @internal
   */
  protected _closedConnectionCount = 0;

  /**
   * Server performance and usage metrics.
   *
   * Returns a deep copy of the metrics to prevent external mutation.
   * Includes request counts, status codes, response times, and WebSocket stats.
   *
   * @returns A copy of the current metrics
   * @see {@link ServerMetrics}
   * @see {@link resetMetrics} to reset all counters
   *
   * @example
   * ```typescript
   * declare const server: WebServer;
   *
   * const metrics = server.metrics;
   * console.log(`Total requests: ${metrics.requests.total}`);
   * console.log(`Active connections: ${metrics.requests.active}`);
   * console.log(`Error rate: ${metrics.statusCodes['5xx'] / metrics.requests.total}`);
   * ```
   */
  public get metrics(): ServerMetrics {
    return {
      requests: { ...this._metrics.requests },
      statusCodes: { ...this._metrics.statusCodes },
      responseTime: { ...this._metrics.responseTime },
      websocket: {
        upgrades: this._metrics.websocket.upgrades,
        connections: { ...this._metrics.websocket.connections },
        messages: { ...this._metrics.websocket.messages },
        errors: this._metrics.websocket.errors,
        connectionDuration: { ...this._metrics.websocket.connectionDuration },
      },
    };
  }

  /**
   * The server's listening address.
   *
   * - **TCP mode**: Returns `hostname:port` (e.g., `'localhost:8080'`)
   * - **UNIX mode**: Returns the socket file path
   * - **Not running**: Returns `null`
   *
   * @returns The address string or null if server is not running
   *
   * @example
   * ```typescript
   * declare const server: WebServer;
   *
   * server.start();
   * console.log(`Server listening on ${server.address}`);
   * // TCP: "Server listening on localhost:8080"
   * // UNIX: "Server listening on /var/run/myapp.sock"
   * ```
   */
  public get address(): string | null {
    if (this._state !== 'RUNNING') {
      return null;
    }

    if (this.mode === 'TCP') {
      const tcpOptions = this.options as ServerOptions<'TCP'>;
      return `${tcpOptions.hostname}:${this.__boundPort ?? tcpOptions.port}`;
    } else {
      const unixOptions = this.options as ServerOptions<'UNIX'>;
      return unixOptions.unixSocketPath;
    }
  }

  /**
   * The ACTUAL bound TCP port, or `null` when the server is not running
   * or listens on a unix socket. With `port: 0` this is how you learn
   * which port the OS picked:
   *
   * ```typescript
   * import type { ServerHandler } from '@tundralibs/compat/webserver';
   *
   * declare const handler: ServerHandler;
   *
   * const server = new WebServer('t', { mode: 'TCP', port: 0, handler });
   * await server.start();
   * await fetch(`http://localhost:${server.port}/`);
   * ```
   */
  public get port(): number | null {
    if (this._state !== 'RUNNING' || this.mode !== 'TCP') return null;
    return this.__boundPort ??
      (this.options as ServerOptions<'TCP'>).port ?? null;
  }

  /**
   * Native server client instance.
   *
   * Type varies by runtime:
   * - **Bun**: `_BunServerHandle` (minimal `ref`/`unref`/`stop` shape)
   * - **Deno**: `_DenoServerHandle` (minimal `ref`/`unref`/`shutdown`/`finished` shape)
   * - **Node.js**: `http.Server` or `https.Server`
   *
   * @internal
   */
  protected _client:
    | _DenoServerHandle
    | _BunServerHandle
    | InstanceType<typeof nodeHttp.Server>
    | InstanceType<typeof nodeHttps.Server>
    | null = null;

  /**
   * The ACTUAL bound TCP port, captured at listen time. This is what
   * makes `port: 0` usable: the runtime picks a free port, and
   * {@link address} / {@link port} report the real one instead of the
   * configured `0`. The HOSTNAME stays the configured one — runtimes
   * report resolved loopback literals (`::1`) where users configured
   * `localhost`, and the display contract predates this field.
   * `null` while stopped and in UNIX mode.
   * @private
   */
  private __boundPort: number | null = null;

  /**
   * Registry of event listeners keyed by event name.
   * @private
   */
  private __events: Partial<
    {
      [K in keyof ServerEvents]: Array<ServerEvents[K]>;
    }
  > = {};

  /**
   * Listener function for abort signal cleanup.
   * @private
   */
  private __abortListener: (() => Promise<void>) | null = null;

  /**
   * Lazily-built per-runtime adapter. Built on first access (typically
   * `start()`); throws {@link UnsupportedRuntimeError} on unsupported
   * runtimes via {@link __buildAdapter}.
   * @private
   */
  private __adapterCache: _RuntimeAdapter | null = null;

  /**
   * WeakMap tracking WebSocket connection data (start time + cached wrapper).
   *
   * Uses WeakMap to:
   * 1. Avoid memory leaks - entries are GC'd when socket closes
   * 2. Cache wrappers for efficiency - same wrapper used across events
   * 3. Track connection duration for metrics
   *
   * @private
   */
  private readonly __wsConnectionData = new WeakMap<
    // deno-lint-ignore no-explicit-any
    any,
    {
      startTime: number;
      wrapper: ServerWebSocket<T>;
    }
  >();

  /**
   * Creates a new WebServer instance.
   *
   * Validates all configuration options during construction. Throws
   * {@link ServerConfigurationError} or {@link ServerPermissionError}
   * for invalid configurations.
   *
   * @param name - Unique server name (used in events and logging). Must be non-empty.
   * @param options - Server configuration options
   *
   * @throws {@link ServerConfigurationError} If:
   *   - `name` is empty or whitespace-only
   *   - `mode` is not 'TCP' or 'UNIX'
   *   - `handler` is not a function
   *   - `port` is outside 0-65535 range
   *   - `unixSocketPath` directory doesn't exist
   *   - TLS certificate/key files don't exist
   *
   * @throws {@link ServerPermissionError} If:
   *   - Cannot read TLS certificate or key files
   *   - Cannot write to UNIX socket directory
   *
   * @example TCP server
   * ```typescript
   * const server = new WebServer('MyAPI', {
   *   mode: 'TCP',
   *   port: 3000,
   *   hostname: '0.0.0.0',
   *   handler: (req) => new Response('OK'),
   * });
   * ```
   *
   * @example HTTPS server
   * ```typescript
   * const server = new WebServer('SecureAPI', {
   *   mode: 'TCP',
   *   port: 443,
   *   tls: {
   *     certFile: '/etc/ssl/cert.pem',
   *     keyFile: '/etc/ssl/key.pem',
   *   },
   *   handler: (req) => new Response('OK'),
   * });
   * ```
   */
  constructor(name: string, options: ServerOptions<ServerMode, T>) {
    if (name.trim() === '') {
      throw new ServerConfigurationError(
        'N/A',
        'name',
        name,
        'a non-empty string',
      );
    }
    this.__validateOptions(options);
    this.mode = options.mode;
    this.name = name.trim();
    // Apply defaults for TCP mode
    if (options.mode === 'TCP') {
      this.options = {
        ...options,
        port: options.port ?? 8008,
        hostname: options.hostname ?? 'localhost',
      };
    } else {
      this.options = options;
    }
  }

  /**
   * Registers an event listener.
   *
   * Multiple listeners can be registered for the same event.
   * Listeners are called in registration order.
   *
   * @typeParam K - Event name key from {@link ServerEvents}
   * @param event - Event name to listen for
   * @param listener - Callback function or array of functions
   *
   * @example Single listener
   * ```typescript
   * declare const server: WebServer;
   *
   * server.on('onResponse', (name, req, info, res) => {
   *   console.log(`${req.method} ${req.url} -> ${res.status}`);
   * });
   * ```
   *
   * @example Multiple listeners
   * ```typescript
   * declare const server: WebServer;
   * declare const logger: { error(err: Error): void };
   * declare const metrics: { recordError(err: Error): void };
   *
   * server.on('onError', [
   *   (name, error) => logger.error(error),
   *   (name, error) => metrics.recordError(error),
   * ]);
   * ```
   *
   * @see {@link off} to remove listeners
   * @see {@link ServerEvents} for available events
   */
  public on<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K],
  ): void;
  /**
   * Batch form of {@link on} — registers every listener in the array, in
   * order, for the same event.
   *
   * @typeParam K - Event name key from {@link ServerEvents}
   */
  public on<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K][],
  ): void;
  public on<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K] | ServerEvents[K][],
  ): void {
    if (!this.__events[event]) {
      this.__events[event] = [];
    }
    if (Array.isArray(listener)) {
      this.__events[event].push(...listener);
    } else {
      this.__events[event].push(listener);
    }
  }

  /**
   * Removes an event listener.
   *
   * Can remove a specific listener, multiple listeners, or all listeners
   * for an event depending on the arguments provided.
   *
   * @typeParam K - Event name key from {@link ServerEvents}
   * @param event - Event name
   * @param listener - Specific listener(s) to remove, or omit to remove all
   *
   * @example Remove specific listener
   * ```typescript
   * import type { ServerEvents } from '@tundralibs/compat/webserver';
   *
   * declare const server: WebServer;
   *
   * const myHandler: ServerEvents['onResponse'] = (name, req, info, res) =>
   *   console.log(res.status);
   * server.on('onResponse', myHandler);
   * server.off('onResponse', myHandler);
   * ```
   *
   * @example Remove all listeners for an event
   * ```typescript
   * declare const server: WebServer;
   *
   * server.off('onError'); // Removes all error handlers
   * ```
   *
   * @see {@link on} to register listeners
   */
  public off<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K],
  ): void;

  /**
   * Batch form of {@link off} — removes each listener in the array.
   * Entries that were never registered are ignored.
   *
   * @typeParam K - Event name key from {@link ServerEvents}
   */
  public off<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K][],
  ): void;

  /**
   * Removes every listener registered for `event`.
   *
   * @typeParam K - Event name key from {@link ServerEvents}
   */
  public off<K extends keyof ServerEvents>(
    event: K,
  ): void;

  public off<K extends keyof ServerEvents>(
    event: K,
    listener?: ServerEvents[K] | ServerEvents[K][],
  ): void {
    if (!this.__events[event]) {
      return;
    }
    if (listener === undefined) {
      // Remove all listeners for the event
      delete this.__events[event];
    } else {
      const listeners = Array.isArray(listener) ? listener : [listener];
      for (const l of listeners) {
        const index = this.__events[event].indexOf(l);
        if (index !== -1) {
          this.__events[event].splice(index, 1);
        }
      }
    }
  }

  /**
   * Resets all metrics to their initial values.
   *
   * Clears:
   * - Request counters (total, active, peakActive)
   * - Status code counters (all 1xx-5xx)
   * - Response time statistics (resets min to Infinity, max/average to 0)
   * - WebSocket metrics (connections, messages, errors, duration)
   *
   * Active request count is also reset - use with caution while requests
   * are being processed.
   *
   * @example
   * ```typescript
   * declare const server: WebServer;
   *
   * // Reset metrics every hour
   * setInterval(() => {
   *   const oldMetrics = server.metrics;
   *   console.log(`Hourly stats: ${oldMetrics.requests.total} requests`);
   *   server.resetMetrics();
   * }, 60 * 60 * 1000);
   * ```
   */
  public resetMetrics(): void {
    this._metrics = {
      requests: {
        total: 0,
        active: 0,
        peakActive: 0,
      },
      statusCodes: {
        '1xx': 0,
        '2xx': 0,
        '3xx': 0,
        '4xx': 0,
        '5xx': 0,
      },
      responseTime: {
        min: Infinity,
        max: 0,
        average: 0,
      },
      websocket: {
        upgrades: 0,
        connections: {
          total: 0,
          active: 0,
          peakActive: 0,
        },
        messages: {
          received: 0,
          sent: 0,
        },
        errors: 0,
        connectionDuration: {
          min: Infinity,
          max: 0,
          average: 0,
        },
      },
    };
    this._totalResponseTime = 0;
    this._totalConnectionDuration = 0;
    this._closedConnectionCount = 0;
  }

  /**
   * Starts the server and begins accepting connections.
   *
   * The returned `Promise<void>` resolves once the listener is actually
   * bound and accepting connections — Deno and Node both bind the
   * underlying socket asynchronously even though their `serve` /
   * `listen` calls return synchronously, so callers that did
   * `server.start(); fetch(...)` previously raced the bind. Always
   * `await server.start()`.
   *
   * The server must be in 'STOPPED' state to start. After starting:
   * - State transitions: STOPPED → STARTING → RUNNING
   * - `onStart` event fires when ready to accept connections
   * - If `abortSignal` was provided, automatic stop on abort
   *
   * For UNIX mode, any existing socket file is removed before binding.
   *
   * @throws {@link ServerAlreadyRunningError} If server is not in STOPPED state
   * @throws {@link UnsupportedRuntimeError} If runtime is not supported
   * @throws {@link ServerError} If server fails to bind to address
   *
   * @example Basic usage
   * ```typescript
   * import type { ServerOptions } from '@tundralibs/compat/webserver';
   *
   * declare const options: ServerOptions;
   *
   * const server = new WebServer('API', options);
   * await server.start();
   * console.log(`Listening on ${server.address}`);
   * ```
   *
   * @example With error handling
   * ```typescript
   * import { ServerAlreadyRunningError } from '@tundralibs/compat/webserver';
   *
   * declare const server: WebServer;
   *
   * try {
   *   await server.start();
   * } catch (error) {
   *   if (error instanceof ServerAlreadyRunningError) {
   *     console.log('Server was already running');
   *   } else {
   *     console.error('Failed to start:', error);
   *   }
   * }
   * ```
   *
   * @example With abort signal
   * ```typescript
   * import type { ServerOptions } from '@tundralibs/compat/webserver';
   *
   * declare const options: ServerOptions;
   *
   * const controller = new AbortController();
   * const server = new WebServer('API', {
   *   ...options,
   *   abortSignal: controller.signal,
   * });
   *
   * await server.start();
   *
   * // Later: graceful shutdown
   * controller.abort();
   * ```
   *
   * @see {@link stop} to stop the server
   * @see {@link state} to check current state
   */
  public async start(): Promise<void> {
    if (this._state !== 'STOPPED') {
      throw new ServerAlreadyRunningError(this.mode, 'start');
    }
    try {
      this._state = 'STARTING';
      if (this.mode === 'UNIX') {
        this.__removeSocketFile(
          (this.options as ServerOptions<'UNIX'>).unixSocketPath,
        );
      }
      await this.__adapter().start();
      if (this.options.abortSignal) {
        this.__abortListener = async () => {
          await this.stop();
        };
        this.options.abortSignal.addEventListener(
          'abort',
          this.__abortListener,
        );
      }
      this._state = 'RUNNING';
      this._emit('onStart', this.name, this.mode);
    } catch (error) {
      this._state = 'STOPPED';
      const e = this.__wrapServerError(error, 'start', 'Failed to start');
      this._emit('onError', this.name, e);
      throw e;
    }
  }

  /**
   * Stops the server.
   *
   * The server must be in 'RUNNING' state to stop. After stopping:
   * - State transitions: RUNNING → STOPPING → STOPPED
   * - For UNIX mode, socket file is cleaned up
   * - `onClose` event fires when fully stopped
   * - Abort signal listener is removed if present
   *
   * @param graceful - If true (default), waits for active connections to complete.
   *                   If false, forcefully closes all connections immediately.
   *
   * @returns Promise that resolves when server has fully stopped
   *
   * @throws {@link ServerNotRunningError} If server is not in RUNNING state
   * @throws {@link UnsupportedRuntimeError} If runtime is not supported
   * @throws {@link ServerError} If stop operation fails
   *
   * @example Graceful shutdown
   * ```typescript
   * declare const server: WebServer;
   *
   * // Wait for active requests to complete
   * await server.stop();
   * console.log('Server stopped gracefully');
   * ```
   *
   * @example Force shutdown
   * ```typescript
   * declare const server: WebServer;
   *
   * // Immediately close all connections
   * await server.stop(false);
   * console.log('Server force stopped');
   * ```
   *
   * @example With timeout
   * ```typescript
   * declare const server: WebServer;
   *
   * const stopTimeout = setTimeout(() => {
   *   console.log('Stop taking too long, forcing...');
   *   server.stop(false);
   * }, 30000);
   *
   * await server.stop();
   * clearTimeout(stopTimeout);
   * ```
   *
   * @see {@link start} to start the server
   * @see {@link state} to check current state
   */
  public stop(graceful = true): Promise<void> {
    if (this._state !== 'RUNNING') {
      throw new ServerNotRunningError(this.mode, 'stop');
    }
    this._state = 'STOPPING';
    let stopPromise: Promise<void>;
    try {
      stopPromise = this.__adapter().stop(graceful);
      if (this.options.abortSignal && this.__abortListener) {
        this.options.abortSignal.removeEventListener(
          'abort',
          this.__abortListener,
        );
        this.__abortListener = null;
      }
      return stopPromise.then(() => {
        // Cleanup UNIX socket after server has stopped
        if (this.options.mode === 'UNIX') {
          this.__removeSocketFile(
            (this.options as ServerOptions<'UNIX'>).unixSocketPath,
          );
        }
        this._state = 'STOPPED';
        this.__boundPort = null;
        this._emit('onClose', this.name, this.mode);
      }).catch((error) => {
        this._state = 'RUNNING';
        const e = this.__wrapServerError(
          error,
          'stop',
          'Failed to stop server',
        );
        this._emit('onError', this.name, e);
        throw e;
      });
    } catch (error) {
      // Handle synchronous errors (e.g., UnsupportedRuntimeError)
      this._state = 'RUNNING';
      throw error;
    }
  }

  /**
   * Marks the server as referenced, preventing the process from exiting.
   *
   * By default, servers keep the process alive. Use {@link unref} to allow
   * the process to exit if the server is the only thing running, then
   * use `ref()` to reverse that.
   *
   * @throws {@link ServerNotRunningError} If server is not running
   * @throws {@link UnsupportedRuntimeError} If runtime is not supported
   * @throws {@link ServerError} If the operation fails
   *
   * @example
   * ```typescript
   * declare const server: WebServer;
   *
   * server.start();
   * server.unref(); // Process can exit even with server running
   * // ... later ...
   * server.ref(); // Process will stay alive for server again
   * ```
   *
   * @see {@link unref} to allow process exit
   */
  ref(): void {
    if (this.state !== 'RUNNING' || this._client === null) {
      throw new ServerNotRunningError(this.mode, 'ref');
    }
    try {
      this.__adapter().ref();
    } catch (error) {
      const e = this.__wrapServerError(error, 'ref', 'Failed to ref server');
      this._emit('onError', this.name, e);
      throw e;
    }
  }

  /**
   * Marks the server as unreferenced, allowing the process to exit.
   *
   * When a server is unreferenced, the process may exit even if the
   * server is still running (assuming no other references keep it alive).
   * Useful for optional background servers that shouldn't block shutdown.
   *
   * @throws {@link ServerNotRunningError} If server is not running
   * @throws {@link UnsupportedRuntimeError} If runtime is not supported
   * @throws {@link ServerError} If the operation fails
   *
   * @example
   * ```typescript
   * import type { ServerOptions } from '@tundralibs/compat/webserver';
   *
   * declare const metricsOptions: ServerOptions;
   *
   * // Start a metrics server that won't prevent process exit
   * const metricsServer = new WebServer('Metrics', metricsOptions);
   * metricsServer.start();
   * metricsServer.unref();
   *
   * // Process will exit when main work is done, even if metrics
   * // server is still running
   * ```
   *
   * @see {@link ref} to prevent process exit
   */
  unref(): void {
    if (this.state !== 'RUNNING' || this._client === null) {
      throw new ServerNotRunningError(this.mode, 'unref');
    }
    try {
      this.__adapter().unref();
    } catch (error) {
      const e = this.__wrapServerError(
        error,
        'unref',
        'Failed to unref server',
      );
      this._emit('onError', this.name, e);
      throw e;
    }
  }
  //#region Protected Methods

  /**
   * Emits an event to all registered listeners.
   *
   * @typeParam K - Event name key from {@link ServerEvents}
   * @param event - Event name to emit
   * @param args - Arguments to pass to listeners
   *
   * @internal
   */
  protected _emit<K extends keyof ServerEvents>(
    event: K,
    ...args: Parameters<ServerEvents[K]>
  ): void {
    const listeners = this.__events[event];
    if (listeners) {
      for (const listener of listeners) {
        (listener as (...args: Parameters<ServerEvents[K]>) => void)(...args);
      }
    }
  }

  /**
   * Record the metric side of a WebSocket open: bumps total + active and
   * recomputes peakActive. The caller is responsible for stashing
   * `{ startTime, wrapper }` in `__wsConnectionData` and invoking the
   * user's `open` handler.
   *
   * @internal
   */
  protected _wsMetricOpen(): void {
    this._metrics.websocket.connections.total++;
    this._metrics.websocket.connections.active++;
    if (
      this._metrics.websocket.connections.active >
        this._metrics.websocket.connections.peakActive
    ) {
      this._metrics.websocket.connections.peakActive =
        this._metrics.websocket.connections.active;
    }
  }

  /**
   * Record the metric side of a WebSocket close. Always decrements
   * active; if `startTime` is provided, also updates connection-
   * duration min/max/average. The caller invokes the user's `close`
   * handler and is responsible for removing the entry from
   * `__wsConnectionData`.
   *
   * @internal
   */
  protected _wsMetricClose(startTime: number | null): void {
    this._metrics.websocket.connections.active--;
    if (startTime === null) return;
    const duration = performance.now() - startTime;
    if (duration < this._metrics.websocket.connectionDuration.min) {
      this._metrics.websocket.connectionDuration.min = duration;
    }
    if (duration > this._metrics.websocket.connectionDuration.max) {
      this._metrics.websocket.connectionDuration.max = duration;
    }
    this._totalConnectionDuration += duration;
    this._closedConnectionCount++;
    this._metrics.websocket.connectionDuration.average =
      this._totalConnectionDuration / this._closedConnectionCount;
  }

  /**
   * Record the metric side of an inbound WebSocket message.
   * @internal
   */
  protected _wsMetricMessage(): void {
    this._metrics.websocket.messages.received++;
  }

  /**
   * Record the metric side of a WebSocket error.
   * @internal
   */
  protected _wsMetricError(): void {
    this._metrics.websocket.errors++;
  }

  /**
   * Builds the read-only accessor side of a {@link ServerWebSocket}
   * wrapper. The three runtime branches differ in how they store user
   * `data` (Bun stashes on `ws.data.userData`; Deno/Node use closure
   * variables) but agree on the surface — this helper centralizes that
   * surface so each `__wrapXWebSocket` only owns its `send`/`close`/
   * `ping`/`pong` shims.
   *
   * @internal
   */
  protected _buildWrapperAccessors(getters: {
    getReadyState: () => number;
    getBufferedAmount: () => number;
    getProtocol: () => string;
    getData: () => T;
    setData: (v: T) => void;
    getRemoteAddress: () => string | undefined;
  }): Pick<
    ServerWebSocket<T>,
    'readyState' | 'bufferedAmount' | 'protocol' | 'data' | 'remoteAddress'
  > {
    return {
      get readyState() {
        return getters.getReadyState();
      },
      get bufferedAmount() {
        return getters.getBufferedAmount();
      },
      get protocol() {
        return getters.getProtocol();
      },
      get data() {
        return getters.getData();
      },
      set data(v: T) {
        getters.setData(v);
      },
      get remoteAddress() {
        return getters.getRemoteAddress();
      },
    };
  }

  /**
   * Processes an incoming HTTP request.
   *
   * Core request handling logic:
   * 1. Validates server is running
   * 2. Updates active request metrics
   * 3. Generates request ID and timestamp
   * 4. Invokes user handler
   * 5. Emits response/error events
   * 6. Updates metrics (status codes, response times)
   *
   * If the handler throws, a 500 response is returned and `onError` fires.
   * Metrics are always updated in a finally block.
   *
   * @param request - The incoming HTTP Request object
   * @param info - Partial request info with remote address/port
   * @returns The Response to send to the client
   *
   * @throws {@link ServerNotRunningError} If server is not in RUNNING state
   *
   * @internal
   */
  protected async _processRequest(
    request: Request,
    info: Pick<RequestInfo, 'remoteAddress' | 'remotePort'>,
  ): Promise<Response> {
    if (this._state !== 'RUNNING') {
      throw new ServerNotRunningError(this.mode, 'ProcessRequest');
    }
    const startTime = performance.now();
    this._metrics.requests.active++;
    if (this._metrics.requests.active > this._metrics.requests.peakActive) {
      this._metrics.requests.peakActive = this._metrics.requests.active;
    }
    const requestInfo: RequestInfo = {
      remoteAddress: info.remoteAddress,
      remotePort: info.remotePort,
      requestId: crypto.randomUUID(),
      requestTime: new Date(),
    };
    let response: Response | undefined;
    try {
      try {
        response = await this.options.handler(request, requestInfo);
        this._emit('onResponse', this.name, request, requestInfo, response);
      } catch (error) {
        let e: ServerError;
        // Re-throw ServerError as-is, wrap others
        if (error instanceof ServerError) {
          e = error;
        } else {
          e = new ServerError(
            `Failed to process request: ${(error as Error).message}`,
            this.mode,
            'ProcessRequest',
            error as Error,
          );
        }
        this._emit('onError', this.name, e, request, requestInfo);
        // Return error response instead of throwing
        response = new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return response;
    } finally {
      const responseTime = performance.now() - startTime;
      this._metrics.requests.active--;
      this._metrics.requests.total++;
      if (response) {
        const statusCategory = `${
          Math.floor(response.status / 100)
        }xx` as keyof typeof this._metrics.statusCodes;
        this._metrics.statusCodes[statusCategory]++;
      }

      // Update response time metrics using accumulated sum for better precision
      if (responseTime < this._metrics.responseTime.min) {
        this._metrics.responseTime.min = responseTime;
      }
      if (responseTime > this._metrics.responseTime.max) {
        this._metrics.responseTime.max = responseTime;
      }
      this._totalResponseTime += responseTime;
      this._metrics.responseTime.average = this._totalResponseTime /
        this._metrics.requests.total;
    }
  }

  //#region Shared upgrade resolution

  /**
   * Resolves the user's upgrade hook (if any) into a typed decision
   * the runtime-specific upgrade blocks can act on. Centralized so the
   * Bun, Deno, and Node branches share one source of truth for
   * back-compat defaults, decision-shape unpacking, and the upgrade
   * context construction.
   *
   * @internal
   */
  protected async _resolveUpgrade(
    request: Request,
    remoteAddress: string | null,
    remotePort: number | null,
  ): Promise<_ResolvedUpgrade<T>> {
    const wsHandler = this.options.websocket;
    // Snapshot to a fresh Request: on Bun, `server.upgrade()`
    // invalidates the original request's `url` after upgrade — the
    // open handler then sees `ctx.request.url === ''`. Headers and
    // method survive, but URL doesn't. Capturing into a new Request
    // here gives users a stable object across runtimes.
    const snapshotRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
    });
    const upgradeContext: WebSocketUpgradeContext = {
      request: snapshotRequest,
      remoteAddress,
      remotePort,
    };
    const decision: UpgradeDecision<T> = wsHandler?.upgrade
      ? await wsHandler.upgrade(request, { remoteAddress, remotePort })
      : true;
    if (decision === false) return { accepted: false };
    const isObj = typeof decision === 'object' && decision !== null;
    return {
      accepted: true,
      userData: isObj ? decision.data : (upgradeContext as unknown as T),
      protocol: isObj ? (decision.protocol ?? '') : '',
      extraHeaders: isObj ? decision.headers : undefined,
      upgradeContext,
    };
  }

  //#endregion Shared upgrade resolution

  //#region Bun Methods

  /**
   * Starts the server using Bun's native serve API.
   *
   * Bun-specific behavior:
   * - Uses `Bun.serve()` with native WebSocket support
   * - `backlog` option is not supported (warning emitted)
   * - TLS uses `Bun.file()` for certificate loading
   * - WebSocket handlers wrapped to normalize API
   *
   * @throws Error if binding fails
   *
   * @internal
   */
  protected _startBunServer(): Promise<void> { // NOSONAR - Complexity acceptable for server start
    const wsHandler = this.options.websocket;
    const bunProcessor = async (
      request: Request,
      server: BunServer,
    ) => {
      const requestIP = (server.requestIP) ? server.requestIP(request) : null;
      const requestInfo: Pick<RequestInfo, 'remoteAddress' | 'remotePort'> = {
        remoteAddress: requestIP?.address || null,
        remotePort: requestIP?.port || null,
      };

      // Check for WebSocket upgrade if handler is configured
      if (wsHandler && request.headers.get('upgrade') === 'websocket') {
        this._metrics.websocket.upgrades++;
        const resolved = await this._resolveUpgrade(
          request,
          requestInfo.remoteAddress,
          requestInfo.remotePort,
        );
        if (!resolved.accepted) {
          // Hook refused — fall through to the regular HTTP handler.
          return this._processRequest(request, requestInfo);
        }
        const wrappedData: _BunWsData<T> = {
          userData: resolved.userData,
          upgradeContext: resolved.upgradeContext,
          protocol: resolved.protocol,
        };
        const upgradeOpts: { data: _BunWsData<T>; headers?: Headers } = {
          data: wrappedData,
        };
        if (resolved.extraHeaders || resolved.protocol) {
          const headers = new Headers(resolved.extraHeaders);
          if (resolved.protocol) {
            headers.set('Sec-WebSocket-Protocol', resolved.protocol);
          }
          upgradeOpts.headers = headers;
        }
        // The cast bypasses Bun's conditional-typed `data` arg — our
        // internal `_BunWsData<T>` doesn't unify with their `[T] extends
        // [undefined] ? ...` form.
        const upgraded = (server.upgrade as unknown as (
          req: Request,
          opts: { data: unknown; headers?: Headers },
        ) => boolean)(request, upgradeOpts);
        if (upgraded) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      return this._processRequest(request, requestInfo);
    };
    // Use Record type to avoid conflict with Bun's WebSocketHandler type
    const options: Record<string, unknown> = {
      development: false,
      fetch: bunProcessor,
    };

    // Add WebSocket handlers if configured
    if (wsHandler) {
      // Bun's WebSocketHandler doesn't have an 'error' callback - errors are handled differently
      const bunWsHandler: Record<string, unknown> = {
        open: (ws: BunServerWebSocket<_BunWsData<T>>) => {
          // Create and cache wrapper for reuse across events
          const wrapper = this.__wrapBunWebSocket(ws);
          this.__wsConnectionData.set(ws, {
            startTime: performance.now(),
            wrapper,
          });
          this._wsMetricOpen();
          // Synthesize Bun's missing `error` event by wrapping user
          // handlers in try/catch and routing exceptions to it.
          try {
            wsHandler.open?.(wrapper, ws.data.upgradeContext);
          } catch (err) {
            this.__handleBunWsError(wrapper, err);
          }
        },
        message: (
          ws: BunServerWebSocket<_BunWsData<T>>,
          message: WebSocketData,
        ) => {
          this._wsMetricMessage();
          const data = this.__wsConnectionData.get(ws);
          if (data) {
            try {
              wsHandler.message?.(data.wrapper, message);
            } catch (err) {
              this.__handleBunWsError(data.wrapper, err);
            }
          }
        },
        close: (
          ws: BunServerWebSocket<_BunWsData<T>>,
          code: number,
          reason: string,
        ) => {
          const data = this.__wsConnectionData.get(ws);
          if (data) {
            this._wsMetricClose(data.startTime);
            this.__wsConnectionData.delete(ws);
            wsHandler.close?.(data.wrapper, code, reason);
          } else {
            // Fallback: create wrapper on-demand if data was missing
            this._wsMetricClose(null);
            const fallbackWrapper = this.__wrapBunWebSocket(ws);
            wsHandler.close?.(fallbackWrapper, code, reason);
          }
        },
        idleTimeout: wsHandler.idleTimeout,
        sendPings: true,
      };

      if (wsHandler.ping) {
        bunWsHandler.ping = (
          ws: BunServerWebSocket<_BunWsData<T>>,
          data: Uint8Array,
        ) => {
          const wsData = this.__wsConnectionData.get(ws);
          if (wsData) {
            wsHandler.ping?.(wsData.wrapper, data);
          }
        };
      }
      if (wsHandler.pong) {
        bunWsHandler.pong = (
          ws: BunServerWebSocket<_BunWsData<T>>,
          data: Uint8Array,
        ) => {
          const wsData = this.__wsConnectionData.get(ws);
          if (wsData) {
            wsHandler.pong?.(wsData.wrapper, data);
          }
        };
      }
      if (wsHandler.drain) {
        bunWsHandler.drain = (
          ws: BunServerWebSocket<_BunWsData<T>>,
        ) => {
          const wsData = this.__wsConnectionData.get(ws);
          if (wsData) {
            wsHandler.drain?.(wsData.wrapper);
          }
        };
      }

      options.websocket = bunWsHandler;
    }

    if (this.mode === 'TCP') {
      options.port = (this.options as ServerOptions<'TCP'>).port;
      options.hostname = (this.options as ServerOptions<'TCP'>).hostname;
      options.reusePort = (this.options as ServerOptions<'TCP'>).reusePort;
      if ((this.options as ServerOptions<'TCP'>).backlog !== undefined) {
        this._emit(
          'onWarning',
          this.name,
          'Bun does not support backlog option; it will be ignored.',
        );
      }
      const validated = this.__resolveTLS();
      if (validated) {
        options.tls = {
          cert: validated.cert,
          key: validated.key,
          ca: validated.ca,
        };
      }
    } else {
      options.unix = (this.options as ServerOptions<'UNIX'>).unixSocketPath;
    }
    this._client = Bun.serve(
      options as unknown as Parameters<typeof Bun.serve>[0],
    );
    if (this.mode === 'TCP') {
      // Bun's handle exposes the ACTUAL bound port (the minimal handle
      // type omits it to keep `typeof Bun` out of public types).
      const bound = this._client as unknown as { port?: number };
      if (typeof bound.port === 'number') {
        this.__boundPort = bound.port;
      }
    }
    // Bun.serve is synchronously listening by the time it returns; no
    // microtask-bind race like Deno or Node, so resolve immediately.
    return Promise.resolve();
  }

  /**
   * Wraps a Bun WebSocket to the unified ServerWebSocket interface.
   *
   * Creates a wrapper that:
   * - Tracks sent message metrics
   * - Normalizes ping/pong return values (returns true for success)
   * - Exposes consistent property names
   *
   * Wrappers are cached in `__wsConnectionData` for reuse across events.
   *
   * @param ws - Native Bun WebSocket
   * @returns Unified ServerWebSocket wrapper
   *
   * @private
   */
  private __wrapBunWebSocket(
    ws: BunServerWebSocket<_BunWsData<T>>,
  ): ServerWebSocket<T> {
    return {
      send: (data: WebSocketData) => {
        this._metrics.websocket.messages.sent++;
        ws.send(data);
      },
      close: (code?: number, reason?: string) => ws.close(code, reason),
      ping: (data?: WebSocketData) => {
        ws.ping(data);
        return true;
      },
      pong: (data?: WebSocketData) => {
        ws.pong(data);
        return true;
      },
      ...this._buildWrapperAccessors({
        getReadyState: () => ws.readyState,
        // Bun exposes bufferedAmount per the Web standard; default to 0
        // if the runtime version is older than 1.1 where it landed.
        getBufferedAmount: () =>
          (ws as unknown as { bufferedAmount?: number }).bufferedAmount ?? 0,
        getProtocol: () => ws.data.protocol,
        getData: () => ws.data.userData,
        setData: (v: T) => {
          ws.data.userData = v;
        },
        getRemoteAddress: () => ws.remoteAddress,
      }),
    };
  }

  /**
   * Synthesize an `error` event from a thrown exception in a Bun
   * WebSocket handler. Bun's runtime doesn't expose an error callback;
   * we wrap user handlers in try/catch and route exceptions here.
   *
   * @internal
   */
  private __handleBunWsError(
    wrapper: ServerWebSocket<T>,
    err: unknown,
  ): void {
    this._wsMetricError();
    const wsHandler = this.options.websocket;
    if (!wsHandler?.error) return;
    const error = err instanceof Error ? err : new Error(_stringifyThrown(err));
    try {
      wsHandler.error(wrapper, error);
    } catch {
      // Don't loop forever on errors-in-error-handler; swallow.
    }
  }
  //#endregion Bun Methods

  //#region Deno Methods

  /**
   * Starts the server using Deno's native serve API.
   *
   * Deno-specific behavior:
   * - Uses `Deno.serve()` with full option support
   * - WebSocket via `Deno.upgradeWebSocket()` API
   * - TLS certificates read into memory
   * - Supports backlog and reusePort options
   * - UNIX sockets via transport: 'unix'
   *
   * @throws Error if binding fails
   *
   * @internal
   */
  protected _startDenoServer(): Promise<void> { // NOSONAR - Complexity acceptable for server start
    const wsHandler = this.options.websocket;
    const options: Record<string, unknown> = {};
    const denoProcessor = async (
      request: Request,
      info: DenoServeHandlerInfo,
    ) => {
      const requestInfo: Pick<RequestInfo, 'remoteAddress' | 'remotePort'> = {
        remoteAddress: (info.remoteAddr.transport === 'tcp')
          ? info.remoteAddr.hostname
          : null,
        remotePort: (info.remoteAddr.transport === 'tcp')
          ? info.remoteAddr.port
          : null,
      };

      // Check for WebSocket upgrade if handler is configured
      if (wsHandler && request.headers.get('upgrade') === 'websocket') {
        this._metrics.websocket.upgrades++;
        const resolved = await this._resolveUpgrade(
          request,
          requestInfo.remoteAddress,
          requestInfo.remotePort,
        );
        if (!resolved.accepted) {
          return this._processRequest(request, requestInfo);
        }

        try {
          const upgradeOptions: { idleTimeout?: number; protocol?: string } =
            {};
          if (wsHandler.idleTimeout !== undefined) {
            upgradeOptions.idleTimeout = wsHandler.idleTimeout;
          }
          if (resolved.protocol) upgradeOptions.protocol = resolved.protocol;
          const { socket, response } = Deno.upgradeWebSocket(
            request,
            upgradeOptions,
          );
          // Create and cache wrapper for reuse across events
          const wrapper = this.__wrapDenoWebSocket(
            socket,
            resolved.userData,
            resolved.upgradeContext,
          );
          this.__wsConnectionData.set(socket, {
            startTime: performance.now(),
            wrapper,
          });

          socket.onopen = () => {
            this._wsMetricOpen();
            wsHandler.open?.(wrapper, resolved.upgradeContext);
          };

          socket.onmessage = (event: MessageEvent) => {
            this._wsMetricMessage();
            wsHandler.message?.(wrapper, event.data as WebSocketData);
          };

          socket.onclose = (event: CloseEvent) => {
            const data = this.__wsConnectionData.get(socket);
            if (data) {
              this._wsMetricClose(data.startTime);
              this.__wsConnectionData.delete(socket);
            } else {
              this._wsMetricClose(null);
            }
            wsHandler.close?.(wrapper, event.code, event.reason);
          };

          socket.onerror = (event: Event | ErrorEvent) => {
            this._wsMetricError();
            const error = 'error' in event
              ? event.error as Error
              : new Error('WebSocket error');
            wsHandler.error?.(wrapper, error);
          };

          return response;
        } catch {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }
      }

      return this._processRequest(request, requestInfo);
    };

    if (this.mode === 'TCP') {
      options.port = (this.options as ServerOptions<'TCP'>).port;
      options.hostname = (this.options as ServerOptions<'TCP'>).hostname;
      options.backlog = (this.options as ServerOptions<'TCP'>).backlog;
      options.reusePort = (this.options as ServerOptions<'TCP'>).reusePort;
      // TLS
      const validated = this.__resolveTLS();
      if (validated) {
        options.cert = validated.cert;
        options.key = validated.key;
        options.caCerts = validated.ca;
      }
    } else {
      options.transport = 'unix';
      options.path = (this.options as ServerOptions<'UNIX'>).unixSocketPath;
    }
    // `Deno.serve` returns synchronously but the underlying TCP/Unix
    // bind happens asynchronously. Without `onListen`, callers that do
    // `await server.start(); await fetch(...)` race the bind and hit
    // ECONNREFUSED. We register an `onListen` callback that resolves a
    // promise once the listener is actually accepting connections.
    const ready = new Promise<void>((resolve) => {
      options.onListen = (localAddr: unknown) => {
        // TCP gives a NetAddr ({ hostname, port }); unix gives a path.
        const addr = localAddr as { port?: number };
        if (typeof addr?.port === 'number') {
          this.__boundPort = addr.port;
        }
        resolve();
      };
    });
    this._client = Deno.serve(options, denoProcessor);
    return ready;
  }

  /**
   * Wraps a Deno WebSocket to the unified ServerWebSocket interface.
   *
   * Creates a wrapper that:
   * - Tracks sent message metrics
   * - Returns false for ping/pong (Deno handles automatically)
   * - Stores context data for the connection
   *
   * Wrappers are cached in `__wsConnectionData` for reuse across events.
   *
   * @param ws - Native browser-style WebSocket from Deno
   * @param context - Upgrade context with request and address info
   * @returns Unified ServerWebSocket wrapper
   *
   * @private
   */
  private __wrapDenoWebSocket(
    ws: WebSocket,
    userData: T,
    context: WebSocketUpgradeContext,
  ): ServerWebSocket<T> {
    // Closure-captured so the wrapper's `data` setter can mutate
    // (Deno's WebSocket doesn't carry user data on the underlying
    // socket the way Bun does).
    let connectionData = userData;
    // Drain emulation: Deno's WebSocket doesn't surface a drain event,
    // so we poll bufferedAmount after each `send()` and fire the user's
    // drain callback when the buffer empties out. At most one polling
    // chain runs per socket — `drainTimer` tracks it so back-to-back
    // sends don't spawn parallel chains.
    let drainTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleDrainCheck = () => {
      if (drainTimer !== null) return; // already polling
      if (ws.bufferedAmount === 0) return; // nothing to drain
      const tick = () => {
        if (ws.readyState !== 1 /* OPEN */) {
          drainTimer = null;
          return;
        }
        if (ws.bufferedAmount === 0) {
          drainTimer = null;
          try {
            this.options.websocket?.drain?.(wrapper);
          } catch {
            // Drain handlers shouldn't throw; swallow if they do.
          }
        } else {
          drainTimer = setTimeout(tick, 50);
        }
      };
      drainTimer = setTimeout(tick, 50);
    };
    const wrapper: ServerWebSocket<T> = {
      send: (data: WebSocketData) => {
        this._metrics.websocket.messages.sent++;
        // `WebSocketData`'s `Uint8Array` is `Uint8Array<ArrayBufferLike>` under
        // TS 5.7+, which the platform `send`'s `BufferSource` rejects; the
        // backing buffer is always a real `ArrayBuffer` here, so the cast is safe.
        ws.send(data as string | BufferSource);
        if (this.options.websocket?.drain) scheduleDrainCheck();
      },
      close: (code?: number, reason?: string) => ws.close(code, reason),
      ping: () => {
        // Deno WebSocket doesn't expose ping directly, handles it automatically
        return false;
      },
      pong: () => {
        // Deno WebSocket doesn't expose pong directly, handles it automatically
        return false;
      },
      ...this._buildWrapperAccessors({
        getReadyState: () => ws.readyState,
        getBufferedAmount: () => ws.bufferedAmount,
        getProtocol: () => ws.protocol,
        getData: () => connectionData,
        setData: (v: T) => {
          connectionData = v;
        },
        getRemoteAddress: () => context.remoteAddress ?? undefined,
      }),
    };
    return wrapper;
  }

  //#endregion Deno Methods

  //#region Node.js Methods

  /**
   * Starts the server using Node.js http/https modules.
   *
   * Node.js-specific behavior:
   * - Uses `http.createServer()` or `https.createServer()`
   * - Converts Node.js request/response to Fetch API objects
   * - Streams request body via ReadableStream
   * - WebSocket upgrades handled via the `ws` npm package, loaded
   *   lazily so non-WS users don't pull it in
   * - Supports backlog and all TCP options
   *
   * @throws Error if binding fails
   *
   * @internal
   */
  protected async _startNodeServer(): Promise<void> { // NOSONAR - Complexity acceptable for server start
    const processNodeRequest = (
      req: InstanceType<typeof nodeHttp.IncomingMessage>,
      res: InstanceType<typeof nodeHttp.ServerResponse>,
    ) => {
      // `__nodeReqToFetchRequest` reconstructs the request URL from the
      // client-supplied `Host` header. A value that Node's HTTP parser
      // accepts but WHATWG URL parsing rejects (e.g. an out-of-range
      // port) makes `new URL` throw. This listener runs synchronously
      // with no wrapping try/catch, so an escaped throw would surface as
      // an `uncaughtException` and terminate the whole process — an
      // unauthenticated remote DoS. Reject the malformed request with a
      // 400 instead of letting the throw escape.
      let request: Request;
      try {
        request = this.__nodeReqToFetchRequest(req);
      } catch {
        res.statusCode = 400;
        res.end('Bad Request');
        return;
      }
      const remoteAddr = req.socket.remoteAddress;
      const remotePort = req.socket.remotePort;
      const requestInfo: Pick<RequestInfo, 'remoteAddress' | 'remotePort'> = {
        remoteAddress: remoteAddr ?? null,
        remotePort: remotePort ?? null,
      };
      const responsePromise = this._processRequest(request, requestInfo);
      responsePromise.then(
        (response) => {
          res.statusCode = response.status;
          res.statusMessage = response.statusText;

          // Copy headers, but emit Set-Cookie as a real multi-value
          // header. Headers.forEach yields `set-cookie` once, comma-joined,
          // which mangles multiple cookies into a single invalid header;
          // getSetCookie() preserves each cookie as a separate line.
          const hdrs = response.headers as Headers & {
            getSetCookie?: () => string[];
          };
          hdrs.forEach((value, key) => {
            if (key.toLowerCase() !== 'set-cookie') {
              res.setHeader(key, value);
            }
          });
          const setCookies = typeof hdrs.getSetCookie === 'function'
            ? hdrs.getSetCookie()
            : [];
          if (setCookies.length > 0) {
            res.setHeader('Set-Cookie', setCookies);
          }

          if (response.body) {
            const reader = response.body.getReader();
            let cancelled = false;

            // Cleanup reader if response is closed prematurely
            res.on('close', () => { // NOSONAR - Cleanup handler requires nesting
              if (!cancelled) {
                cancelled = true;
                reader.cancel().catch(() => {}); // NOSONAR - Swallow errors on cancel
              }
            });

            const pump = (): void => {
              reader.read().then(({ done, value }) => { // NOSONAR - Async streaming pattern requires nesting
                if (done || cancelled) {
                  res.end();
                  return;
                }
                res.write(value);
                pump();
              }).catch((err) => { // NOSONAR - Error handling for stream
                if (!cancelled) {
                  cancelled = true;
                  res.destroy(err);
                }
              });
            };
            pump();
          } else {
            res.end();
          }
        },
      ).catch((err) => {
        // Handle unhandled promise rejections from _processRequest
        if (res.headersSent) {
          res.destroy(err);
        } else {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });
    };

    let server:
      | InstanceType<typeof nodeHttp.Server>
      | InstanceType<typeof nodeHttps.Server>;

    const validated = this.__resolveTLS();
    if (validated) {
      const httpsOptions: Record<string, unknown> = {
        cert: validated.cert,
        key: validated.key,
      };
      if (validated.ca) httpsOptions.ca = validated.ca;
      server = nodeHttps.createServer(httpsOptions, processNodeRequest);
    } else {
      // Create HTTP server
      server = nodeHttp.createServer(processNodeRequest);
    }

    // Attach the WebSocket upgrade handler if configured. `ws` is loaded
    // here — on the async start path — so servers without a `websocket`
    // handler never pull the package in at all.
    if (this.options.websocket) {
      this.__attachNodeWebSocketUpgrade(server, await loadNodeWs());
    }

    // `server.listen()` returns synchronously and binds the port in a
    // microtask. The optional callback is invoked once on the `listening`
    // event — we use it to resolve the readiness promise so callers
    // don't race the bind.
    const ready = new Promise<void>((resolve) => {
      if (this.mode === 'TCP') {
        const tcpOptions = this.options as ServerOptions<'TCP'>;
        server.listen(
          tcpOptions.port,
          tcpOptions.hostname,
          tcpOptions.backlog,
          () => {
            // `address()` is an AddressInfo object once listening on TCP.
            const bound = server.address();
            if (bound !== null && typeof bound === 'object') {
              this.__boundPort = bound.port;
            }
            resolve();
          },
        );
      } else {
        const unixOptions = this.options as ServerOptions<'UNIX'>;
        server.listen(unixOptions.unixSocketPath, () => resolve());
      }
    });

    this._client = server;
    return ready;
  }

  /**
   * Wires WebSocket support onto a Node `http.Server` / `https.Server`
   * instance using the `ws` npm package. Listens to the `upgrade`
   * event, runs our user-supplied upgrade hook, then either rejects
   * the socket or hands it off to `ws.WebSocketServer.handleUpgrade`
   * for the actual WebSocket handshake.
   *
   * `ws` arrives as a parameter rather than a module binding — the
   * caller loads it lazily (see {@link loadNodeWs}) so the package stays
   * out of module evaluation.
   *
   * @internal
   */
  private __attachNodeWebSocketUpgrade(
    server:
      | InstanceType<typeof nodeHttp.Server>
      | InstanceType<typeof nodeHttps.Server>,
    nodeWs: typeof import('ws'),
  ): void {
    const wsHandler = this.options.websocket;
    if (!wsHandler) return;

    const wss = new nodeWs.WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      this._metrics.websocket.upgrades++;

      // WS upgrades are always GET, so the shared helper's body branch
      // skips and we get a header-only Request. The helper can still
      // throw on a malformed `Host` header (see `processNodeRequest`);
      // this `upgrade` listener is also synchronous and unwrapped, so a
      // throw here would crash the process too. Reject the upgrade by
      // destroying the socket instead.
      let request: Request;
      try {
        request = this.__nodeReqToFetchRequest(req);
      } catch {
        socket.destroy();
        return;
      }
      const remoteAddress = req.socket.remoteAddress ?? null;
      const remotePort = req.socket.remotePort ?? null;

      this._resolveUpgrade(request, remoteAddress, remotePort).then(
        (resolved) => {
          if (!resolved.accepted) {
            // Hook refused. Close the raw socket; the client sees an
            // immediate disconnect. (We could write a 401 here, but
            // doing so reliably on the raw socket is fiddly across
            // Node versions; falling through to destroy is simpler.)
            socket.destroy();
            return;
          }

          // Force the chosen subprotocol (if any) by overwriting the
          // request header so `ws.handleUpgrade` echoes it back.
          if (resolved.protocol) {
            req.headers['sec-websocket-protocol'] = resolved.protocol;
          }

          // `ws`'s callback param types come from `@types/ws`, which we
          // intentionally don't pull in (see _runtime-globals.ts). The
          // The `ws` socket instance has no portable cross-runtime type, so
          // it stays `any` (see ignore below); the event-callback params are
          // typed to the runtime shapes the `ws` package documents (Buffer is
          // a Uint8Array subclass, code is a number, etc).
          // deno-lint-ignore no-explicit-any -- Node `ws` socket; no portable type
          wss.handleUpgrade(req, socket, head, (wsConn: any) => {
            const wrapper = this.__wrapNodeWebSocket(
              wsConn,
              resolved.userData,
              resolved.upgradeContext,
            );
            this.__wsConnectionData.set(wsConn, {
              startTime: performance.now(),
              wrapper,
            });
            this._wsMetricOpen();
            wsHandler.open?.(wrapper, resolved.upgradeContext);

            wsConn.on('message', (raw: Uint8Array, isBinary: boolean) => {
              this._wsMetricMessage();
              // `raw` is a Node Buffer (Uint8Array subclass). We use the
              // default 'nodebuffer' binaryType, so it's a single Buffer.
              const data: WebSocketData = isBinary
                ? new Uint8Array(raw)
                : new TextDecoder().decode(raw);
              wsHandler.message?.(wrapper, data);
            });

            wsConn.on('close', (code: number, reason: Uint8Array) => {
              const stash = this.__wsConnectionData.get(wsConn);
              if (stash) {
                this._wsMetricClose(stash.startTime);
                this.__wsConnectionData.delete(wsConn);
              } else {
                this._wsMetricClose(null);
              }
              const reasonStr = new TextDecoder().decode(reason);
              wsHandler.close?.(wrapper, code, reasonStr);
            });

            wsConn.on('error', (err: Error) => {
              this._wsMetricError();
              wsHandler.error?.(wrapper, err);
            });

            if (wsHandler.ping) {
              wsConn.on('ping', (data: Uint8Array) => {
                wsHandler.ping?.(wrapper, new Uint8Array(data));
              });
            }
            if (wsHandler.pong) {
              wsConn.on('pong', (data: Uint8Array) => {
                wsHandler.pong?.(wrapper, new Uint8Array(data));
              });
            }
            if (wsHandler.drain) {
              // ws emits 'drain' on the underlying net.Socket; the
              // `drain` here refers to the WebSocket-level event we
              // expose. ws-the-library doesn't have a direct equivalent;
              // best approximation: when bufferedAmount returns to 0
              // after being non-zero. We poll on send via the wrapper's
              // send shim — see __wrapNodeWebSocket.
            }
          });
        },
      ).catch((err) => {
        // Hook itself threw — refuse the upgrade.
        this._wsMetricError();
        socket.destroy();
        if (wsHandler.error) {
          const error = err instanceof Error
            ? err
            : new Error(_stringifyThrown(err));
          // No wrapper exists yet (upgrade never completed). Pass a
          // disconnected stub so `error` callbacks can still observe
          // upgrade-time failures.
          try {
            wsHandler.error(
              this.__nullNodeWrapper(remoteAddress),
              error,
            );
          } catch {
            // swallow
          }
        }
      });
    });
  }

  /**
   * Wraps a `ws` library WebSocket instance in our cross-runtime
   * {@link ServerWebSocket} shape.
   *
   * @internal
   */
  private __wrapNodeWebSocket(
    ws: import('ws').WebSocket,
    userData: T,
    context: WebSocketUpgradeContext,
  ): ServerWebSocket<T> {
    let connectionData = userData;
    return {
      send: (data: WebSocketData) => {
        this._metrics.websocket.messages.sent++;
        ws.send(data);
      },
      close: (code?: number, reason?: string) => ws.close(code, reason),
      ping: (data?: WebSocketData) => {
        // `ws.ping` accepts Buffer | string. Uint8Array works as Buffer
        // at runtime; ArrayBuffer is wrapped via Uint8Array first.
        const payload = data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data;
        (ws.ping as (d?: unknown) => void)(payload);
        return true;
      },
      pong: (data?: WebSocketData) => {
        const payload = data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data;
        (ws.pong as (d?: unknown) => void)(payload);
        return true;
      },
      ...this._buildWrapperAccessors({
        getReadyState: () => ws.readyState,
        getBufferedAmount: () => ws.bufferedAmount,
        getProtocol: () => ws.protocol,
        getData: () => connectionData,
        setData: (v: T) => {
          connectionData = v;
        },
        getRemoteAddress: () => context.remoteAddress ?? undefined,
      }),
    };
  }

  /**
   * Disconnected stub wrapper for upgrade-time errors where no real
   * WebSocket exists yet. All operations are no-ops so user error
   * handlers can inspect `wrapper.remoteAddress` without crashing.
   *
   * @internal
   */
  private __nullNodeWrapper(
    remoteAddress: string | null,
  ): ServerWebSocket<T> {
    return {
      send: () => {},
      close: () => {},
      ping: () => false,
      pong: () => false,
      readyState: 3, // CLOSED
      bufferedAmount: 0,
      protocol: '',
      data: undefined as unknown as T,
      remoteAddress: remoteAddress ?? undefined,
    };
  }

  //#endregion Node.js Methods

  //#endregion Protected Methods

  //#region Private Methods

  /**
   * Returns the cached per-runtime adapter, building it on first
   * access. Centralizes the runtime dispatch so the public lifecycle
   * methods don't each carry their own `switch (RUNTIME)`.
   *
   * @throws {@link UnsupportedRuntimeError} If the host runtime is not
   * one of Bun, Deno, or Node.
   *
   * @private
   */
  private __adapter(): _RuntimeAdapter {
    if (this.__adapterCache !== null) return this.__adapterCache;
    this.__adapterCache = this.__buildAdapter();
    return this.__adapterCache;
  }

  /**
   * Constructs the runtime adapter. Called once via {@link __adapter}
   * and the result cached. Throws {@link UnsupportedRuntimeError} on
   * unsupported runtimes.
   *
   * @private
   */
  private __buildAdapter(): _RuntimeAdapter {
    switch (RUNTIME) {
      case 'BUN':
        return {
          start: () => this._startBunServer(),
          stop: async (graceful: boolean) => {
            // Bun's `stop(true)` is the force path; omitted/false is graceful.
            await (this._client as _BunServerHandle).stop(
              graceful ? undefined : true,
            );
          },
          ref: () => (this._client as _BunServerHandle).ref(),
          unref: () => (this._client as _BunServerHandle).unref(),
        };
      case 'DENO':
        return {
          start: () => this._startDenoServer(),
          // Deno doesn't expose a force path — `shutdown()` is the only
          // close primitive. Force and graceful collapse to the same call.
          stop: async () => {
            await (this._client as _DenoServerHandle).shutdown();
          },
          ref: () => (this._client as _DenoServerHandle).ref(),
          unref: () => (this._client as _DenoServerHandle).unref(),
        };
      case 'NODE':
        return {
          start: () => this._startNodeServer(),
          stop: (graceful: boolean) => this.__stopNodeServer(graceful),
          ref: () => this.__nodeClient().ref(),
          unref: () => this.__nodeClient().unref(),
        };
      default:
        throw new UnsupportedRuntimeError(
          'server',
          RUNTIME,
          'http server not supported',
        );
    }
  }

  /**
   * Convenience accessor for the Node `http`/`https` server handle.
   *
   * @private
   */
  private __nodeClient():
    | InstanceType<typeof nodeHttp.Server>
    | InstanceType<typeof nodeHttps.Server> {
    return this._client as
      | InstanceType<typeof nodeHttp.Server>
      | InstanceType<typeof nodeHttps.Server>;
  }

  /**
   * Resolves the configured TLS options into validated cert/key/ca
   * material, or `null` if TLS is not configured. Each runtime branch
   * then maps the returned fields into its own option-key conventions
   * (Bun: `tls.cert/key/ca`; Deno: `cert/key/caCerts`; Node:
   * `httpsOptions.cert/key/ca`).
   *
   * @private
   */
  private __resolveTLS(): ValidatedTLS | null {
    if (this.mode !== 'TCP') return null;
    const tlsOpt = (this.options as ServerOptions<'TCP'>).tls;
    if (!tlsOpt) return null;
    return validateTLS(tlsOpt);
  }

  /**
   * Converts a Node `IncomingMessage` into a Fetch-API `Request`. Used
   * by both the regular HTTP processor and the WebSocket upgrade hook;
   * the latter never reads `body` (WS upgrades are GET) so it's safe
   * to share one implementation across both call sites.
   *
   * @throws {TypeError} If the client `Host` header (used as the URL
   *   authority) cannot be parsed by `new URL` — e.g. an out-of-range
   *   port. Both call sites catch this and reject the request rather
   *   than letting the throw crash the process.
   * @private
   */
  private __nodeReqToFetchRequest(
    req: InstanceType<typeof nodeHttp.IncomingMessage>,
  ): Request {
    const protocol = 'encrypted' in req.socket && req.socket.encrypted
      ? 'https'
      : 'http';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `${protocol}://${host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (typeof value === 'string') {
        headers.append(key, value);
      }
    }
    let body: BodyInit | null | undefined = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = new ReadableStream({
        start(controller) {
          req.on('data', (chunk: Uint8Array) => controller.enqueue(chunk));
          req.on('end', () => controller.close());
          req.on('error', (err: Error) => controller.error(err));
        },
      });
    }
    return new Request(url, {
      method: req.method || 'GET',
      headers,
      body,
      // @ts-expect-error - duplex required for streaming request bodies
      duplex: 'half',
    });
  }

  /**
   * Normalizes an unknown thrown value into a {@link ServerError},
   * preserving existing `ServerError` instances and wrapping anything
   * else with the supplied operation tag and message prefix.
   *
   * @private
   */
  private __wrapServerError(
    error: unknown,
    operation: string,
    messagePrefix: string,
  ): ServerError {
    if (error instanceof ServerError) return error;
    return new ServerError(
      `${messagePrefix}: ${(error as Error).message}`,
      this.mode,
      operation,
      error as Error,
    );
  }

  /**
   * Stops the Node `http`/`https` server. On force, terminates active
   * connections first via `closeAllConnections()` then waits for the
   * `close` callback. On graceful, just awaits `close`.
   *
   * @private
   */
  private __stopNodeServer(graceful: boolean): Promise<void> {
    if (this._client === null || !isNode) return Promise.resolve();
    const client = this.__nodeClient();
    if (!graceful) client.closeAllConnections();
    return new Promise<void>((resolve, reject) => {
      client.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Validates all server configuration options.
   *
   * Performs comprehensive validation:
   * - Mode is 'TCP' or 'UNIX'
   * - Handler is a function
   * - TCP options: port range, hostname type, backlog > 0, reusePort boolean
   * - UNIX options: path is non-empty, directory exists and is writable
   * - TLS options: certificates exist and are readable
   *
   * @param options - Options to validate
   *
   * @throws {@link ServerConfigurationError} For invalid option values
   * @throws {@link ServerPermissionError} For permission issues
   *
   * @private
   */
  private __validateOptions(options: ServerOptions<ServerMode, T>): void { // NOSONAR - Complexity acceptable for validation
    if (!('mode' in options)) {
      throw new ServerConfigurationError(
        'N/A',
        'mode',
        undefined,
        `'TCP' or 'UNIX'`,
      );
    }
    if (['TCP', 'UNIX'].includes(options.mode) === false) {
      throw new ServerConfigurationError(
        'N/A',
        'mode',
        options.mode,
        `'TCP' or 'UNIX'`,
      );
    }
    if (typeof options.handler !== 'function') {
      throw new ServerConfigurationError(
        this.mode,
        'handler',
        options.handler,
        'a function',
      );
    }

    if ('unixSocketPath' in options) {
      if (
        typeof options.unixSocketPath !== 'string' ||
        options.unixSocketPath.trim() === ''
      ) {
        throw new ServerConfigurationError(
          this.mode,
          'unixSocketPath',
          options.unixSocketPath,
          'a non-empty string',
        );
      }
      // Validate that the directory for the unix socket exists
      const dirPath = path.dirname(options.unixSocketPath);
      if (!pathExistsSync(dirPath)) {
        throw new ServerConfigurationError(
          this.mode,
          'unixSocketPath',
          options.unixSocketPath,
          `directory '${dirPath}' must exist`,
        );
      }
      // Check if we have write permission
      if (!hasPermissionSync({ name: 'write', path: dirPath })) {
        throw new ServerPermissionError(
          `Insufficient permissions to create unix socket at path '${options.unixSocketPath}'.`,
          this.mode,
        );
      }
    } else {
      this.__validatePort(options.port);
      if (
        options.hostname !== undefined && typeof options.hostname !== 'string'
      ) {
        throw new ServerConfigurationError(
          this.mode,
          'hostname',
          options.hostname,
          'a string',
        );
      }
      if (options.backlog !== undefined) {
        if (typeof options.backlog !== 'number' || options.backlog <= 0) {
          throw new ServerConfigurationError(
            this.mode,
            'backlog',
            options.backlog,
            'a positive number',
          );
        }
      }
      if (
        options.reusePort !== undefined &&
        typeof options.reusePort !== 'boolean'
      ) {
        throw new ServerConfigurationError(
          this.mode,
          'reusePort',
          options.reusePort,
          'a boolean',
        );
      }
      if (options.tls) {
        this.__validateTLSOptions(options.tls);
      }
    }
  }

  /**
   * Validates port number is within valid range.
   *
   * @param port - Port number to validate (0-65535), undefined is allowed
   *
   * @throws {@link ServerConfigurationError} If port is invalid
   *
   * @private
   */
  private __validatePort(port?: number): void {
    if (port === undefined || port === null) {
      return;
    }
    if (typeof port !== 'number' || port < 0 || port > 65535) {
      throw new ServerConfigurationError(
        this.mode,
        'port',
        port,
        'a valid port number (0 to 65535)',
      );
    }
  }

  /**
   * Validates TLS options during construction.
   *
   * Uses common validation functions to ensure:
   * - Path security (no traversal)
   * - File existence (deferred to start time for file-based)
   * - Valid PEM format (checked for string-based)
   *
   * Wraps common validation errors into ServerConfigurationError
   * for consistent server error handling.
   *
   * @param tlsOptions - TLS options to validate
   *
   * @throws {@link ServerConfigurationError} For invalid TLS configuration
   *
   * @private
   */
  private __validateTLSOptions(tlsOptions?: TLSOptions): void { // NOSONAR - Complexity acceptable for validation
    if (!tlsOptions) {
      return;
    }

    try {
      // Use common validation for structure and content
      if ('certFile' in tlsOptions) {
        // Validate that both certFile and keyFile are present
        if (!('keyFile' in tlsOptions)) {
          throw new ServerConfigurationError(
            this.mode,
            'tls',
            tlsOptions,
            'both certFile and keyFile must be provided for file-based TLS options',
          );
        }
        // Basic existence check for constructor validation
        if (
          typeof tlsOptions.certFile !== 'string' ||
          !isFileSync(tlsOptions.certFile)
        ) {
          throw new ServerConfigurationError(
            this.mode,
            'tls.certFile',
            tlsOptions.certFile,
            'a valid path to an existing certificate file',
          );
        }
        if (
          typeof tlsOptions.keyFile !== 'string' ||
          !isFileSync(tlsOptions.keyFile)
        ) {
          throw new ServerConfigurationError(
            this.mode,
            'tls.keyFile',
            tlsOptions.keyFile,
            'a valid path to an existing key file',
          );
        }
        if (tlsOptions.caFile) {
          if (
            typeof tlsOptions.caFile !== 'string' ||
            !isFileSync(tlsOptions.caFile)
          ) {
            throw new ServerConfigurationError(
              this.mode,
              'tls.caFile',
              tlsOptions.caFile,
              'a valid path to an existing CA certificate file',
            );
          }
        }
        // Note: Full validation (PEM format, path traversal) happens
        // at start() time via validateTLSFiles()
      } else if ('cert' in tlsOptions || 'key' in tlsOptions) {
        // Validate string-based TLS
        if (!('cert' in tlsOptions) || !('key' in tlsOptions)) {
          throw new ServerConfigurationError(
            this.mode,
            'tls',
            tlsOptions,
            'both cert and key must be provided for string-based TLS options',
          );
        }
        // Validate PEM format synchronously for string-based
        validateTLSContent(
          tlsOptions.cert,
          tlsOptions.key,
          tlsOptions.ca,
        );
      } else {
        throw new ServerConfigurationError(
          this.mode,
          'tls',
          tlsOptions,
          'valid TLS options with either file paths or string contents',
        );
      }
    } catch (error) {
      // Wrap common validation errors in ServerConfigurationError
      if (
        error instanceof FetchInvalidPEMError ||
        error instanceof FetchPathTraversalError ||
        error instanceof FetchFileNotFoundError ||
        error instanceof FetchTLSError
      ) {
        throw new ServerConfigurationError(
          this.mode,
          'tls',
          tlsOptions,
          error.message,
        );
      }
      throw error;
    }
  }

  /**
   * Removes a UNIX socket file if it exists.
   *
   * Called before starting (to clean up stale sockets) and after
   * stopping (to clean up the socket we created).
   *
   * Errors are silently ignored - this is best-effort cleanup.
   *
   * @param socketPath - Path to the socket file
   *
   * @private
   */
  private __removeSocketFile(socketPath: string): void {
    try {
      // Use pathExistsSync instead of isFileSync because socket files are not
      // regular files on Unix systems - they won't pass isFile() checks but we
      // still need to remove them
      if (pathExistsSync(socketPath)) {
        removeSync(socketPath);
      }
    } catch {
      // Ignore cleanup errors - best effort
    }
  }
  //#endregion Private Methods
}

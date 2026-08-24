/**
 * @fileoverview Configuration shape for {@link WebServer}, discriminated
 * by `mode` (TCP vs UNIX) and parameterised by per-connection
 * WebSocket data type `T`.
 *
 * @module
 */

import type { TLSOptions } from '../../common.ts';
import type { ServerHandler } from './ServerHandler.ts';
import type { ServerMode } from './ServerMode.ts';
import type { WebSocketHandler } from './WebSocketHandler.ts';

/**
 * Server constructor options. The `mode` field discriminates between
 * TCP (port/hostname/TLS) and UNIX (socket path); narrow on it before
 * accessing mode-specific fields.
 *
 * @typeParam M - Server mode.
 * @typeParam T - Per-connection data attached by
 *   {@link WebSocketHandler.upgrade} and exposed as `ws.data`.
 *
 * @example
 * ```typescript
 * const opts: ServerOptions<'TCP'> = {
 *   mode: 'TCP',
 *   port: 8080,
 *   handler: (req) => new Response('hi'),
 * };
 * ```
 */
export type ServerOptions<M extends ServerMode = ServerMode, T = unknown> = (
  & (M extends 'TCP' ? {
      mode: 'TCP';
      /**
       * 0–65535. `0` picks a random free port — read the ACTUAL one from
       * the server's `port` / `address` getters after `start()`.
       * @default 8008
       */
      port?: number;
      /** `'0.0.0.0'` for all IPv4, `'::'` for all IPv6. @default 'localhost' */
      hostname?: string;
      /** Pending-connection queue length. Silently ignored on Bun. */
      backlog?: number;
      /**
       * Allow another listener on the same port (cluster / load-balancing
       * patterns). On Node this is honored only where the kernel exposes
       * `SO_REUSEPORT` (Linux, FreeBSD, illumos/Solaris, AIX) and on Node
       * ≥ 22.12; on macOS and Windows it is a no-op rather than an error,
       * matching Deno/Bun. Ignored on Bun.
       */
      reusePort?: boolean;
      /** TLS settings — when set the server speaks HTTPS. @see {@link TLSOptions} */
      tls?: TLSOptions;
    }
    : {
      mode: 'UNIX';
      /**
       * UNIX socket path. Parent dir must exist; the socket file is
       * created on `start()` and removed on `stop()`. Not supported on
       * Windows.
       */
      unixSocketPath: string;
    })
  & {
    handler: ServerHandler;
    /** Triggers graceful shutdown when aborted (no new connections). */
    abortSignal?: AbortSignal;
    /**
     * OPT-IN runtime metrics (`server.metrics`): request counts,
     * status-code tallies, response times, WebSocket counters. Off by
     * default — collection costs per-request work (measured ~250ns;
     * material against a fast native floor like `Deno.serve`) that
     * consumers with their own observability stack shouldn't pay.
     * Without `metrics: true` the counters simply stay zeroed.
     * @default false
     */
    metrics?: boolean;
    /**
     * WebSocket handler. Backends: native `Bun.serve` websocket on
     * Bun, `Deno.upgradeWebSocket` on Deno, `ws` package on Node.
     * Use {@link WebSocketHandler.upgrade} to gate or customise each
     * upgrade; omitted means all upgrades are accepted.
     */
    websocket?: WebSocketHandler<T>;
  }
) extends infer O ? { [K in keyof O]: O[K] } : never;

/**
 * @fileoverview {@link RapidApplicationServerOptions} — web server + request-cycle
 * configuration group.
 *
 * @module
 */

import type { TLSOptions } from '@tundralibs/compat/common';
import type { RapidApplicationPagingOptions } from './PagingOptions.ts';
import type { RapidApplicationQueryOptions } from './QueryOptions.ts';

/**
 * The web server + request-cycle configuration. Every key is optional
 * at the type level; the rAPId constructor fills defaults, so the group
 * is ALWAYS present (and the request-cycle keys always set) at runtime.
 */
export type RapidApplicationServerOptions = {
  /**
   * Whether this replica runs the HTTP listener. Deployment-shaped:
   * an API replica says true, a worker replica says false — same
   * binary, different config file.
   * @default true
   */
  enabled?: boolean;
  /**
   * TCP port (0-65535; `0` = OS-assigned — read back from the app after
   * start). Mutually exclusive with {@link unixSocketPath}.
   * @default 8008 (compat webserver's default)
   */
  port?: number;
  /**
   * Bind address. Mutually exclusive with {@link unixSocketPath}.
   * @default 'localhost'
   */
  hostname?: string;
  /**
   * Unix domain socket path — replaces TCP entirely when set.
   */
  unixSocketPath?: string;
  /**
   * TLS for the TCP listener (PEM inline or file paths — compat's
   * `TLSOptions`).
   */
  tls?: TLSOptions;
  /**
   * Inbound correlation header the HTTP context adopts (validated —
   * unsafe values are discarded and a fresh id is minted).
   * @default 'x-request-id'
   */
  requestIdHeader?: string;
  /**
   * How many reverse proxies sit in front — a HOP COUNT for resolving
   * the client address from `x-forwarded-for`. `false`/`0` (the safe
   * default) ignores proxy headers entirely, so a client cannot spoof
   * its address. `true`/`1` trusts one proxy and uses the address that
   * proxy observed (the rightmost XFF entry, not the forgeable
   * leftmost); `N` trusts N proxies.
   * @default false
   */
  trustProxy?: boolean | number;
  /**
   * Maximum request body size in bytes for non-file bodies (JSON, text,
   * forms). Checked against content-length before buffering. `0`
   * disables.
   * @default 1048576 (1 MB)
   */
  maxBodySize?: number;
  /**
   * Path that accepts websocket upgrades for `app.socket()` commands
   * (the socket shares the HTTP listener). Upgrades on other paths are
   * rejected and fall through to HTTP routing.
   * @default '/ws'
   */
  socketPath?: string;
  /**
   * Pagination resolution (header names, default/max size) — see
   * {@link RapidApplicationPagingOptions}. Defaults fill missing keys.
   */
  paging?: RapidApplicationPagingOptions;
  /**
   * Query-parser structural caps — see {@link RapidApplicationQueryOptions}.
   * Defaults fill missing keys.
   */
  query?: RapidApplicationQueryOptions;
};

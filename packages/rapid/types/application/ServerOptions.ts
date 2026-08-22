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
   * Collect per-request server metrics (request/status/latency counters,
   * websocket counters) — read back via {@link Application.metrics}.
   * OPT-IN: off by default so the request path pays nothing for
   * bookkeeping no one reads.
   * @default false
   */
  metrics?: boolean;
  /**
   * Auto-register a `HEAD` route for every `GET` route that lacks its own,
   * at boot: the synthesized `HEAD` reuses the `GET` handler + middleware
   * and the response is sent bodiless (headers + a correct `content-length`,
   * per HTTP semantics). An explicit `HEAD` route always wins. Off → a HEAD
   * to a GET-only route is unmatched (404, or 405 if `methodNotAllowed`).
   * @default true
   */
  autoHead?: boolean;
  /**
   * When a request's PATH matches a route but its METHOD doesn't, answer
   * with `405 Method Not Allowed` + an `Allow` header (and answer a generic
   * `OPTIONS` on that path with `204` + `Allow`) instead of `404`. Off →
   * a wrong method is a plain `404`, which hides whether the path exists.
   * The `Allow` list is computed from the router on the miss path only.
   * @default false
   */
  methodNotAllowed?: boolean;
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
  /**
   * Inbound API-version resolution for `@GET(path, {version})`-style
   * versioned routes — a dimension separate from `path` (radrouter's
   * own concept). A request's version resolves: the header's value,
   * exact match → `default` → the unversioned slot. Leaving both unset
   * makes every route effectively unversioned, regardless of whether
   * individual routes declared a `version`.
   */
  versioning?: {
    /**
     * Where the API version is carried:
     * - `'header'` — a request header (`identifier` = the header name);
     * - `'accept'` — an `Accept` media-type vendor tag (`identifier` = the
     *   vendor, matching `application/vnd.<identifier>.<version>+…`);
     * - `'path'` — a leading path segment (`identifier` = a regex whose
     *   first capture group is the version; the matched prefix is stripped
     *   before routing).
     *
     * @default 'header'
     */
    mode?: 'header' | 'accept' | 'path';
    /**
     * Customises the active `mode`: the header name (`header`), the vendor
     * tag (`accept`), or a capture regex (`path`).
     * @default 'x-api-version' (header) · '' (accept) · '^/(v[0-9]+)' (path)
     */
    identifier?: string;
    /** Version used when the request carries none — NOT a fallback for an unrecognized one. */
    default?: string;
  };
};

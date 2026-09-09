/**
 * @fileoverview The API-surface resolver: `server.api` normalised ONCE at
 * boot ({@link normalizeApiSurface}), then per request the hostname to
 * judge ({@link requestHostname}) and the verdict ({@link resolveSurface}) —
 * which surface the request addresses and the pathname to route on.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidContextSurface } from '../types/mod.ts';

/** `server.api`, validated and normalised. */
export type ApiSurface = {
  /** Normalised hostnames (lowercase, punycode, no trailing dot, no port). */
  readonly hosts: ReadonlySet<string>;
  /** The api path prefix (`/api`) — leading slash, no trailing slash. */
  readonly prefix?: string;
  /** Read `x-forwarded-host` (under the trustProxy hop count). */
  readonly trustForwardedHost: boolean;
};

/**
 * Canonical hostname for comparison — what `new URL(...).hostname` yields
 * (lowercase, punycode), with one trailing dot dropped and the port
 * ignored. `undefined` when `value` is not a bare host.
 */
export function normalizeHostname(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(`http://${value.trim()}`);
  } catch {
    return undefined;
  }
  // A path/query/fragment means the value was not a hostname at all.
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return undefined;
  }
  const host = url.hostname.endsWith('.')
    ? url.hostname.slice(0, -1)
    : url.hostname;
  return host === '' ? undefined : host;
}

/**
 * Validate + normalise the `server.api` option.
 *
 * @throws {RapidError} RAPID_CONFIG on a non-object, an unknown key, a
 *   `hosts` entry that is not a bare hostname, a `prefix` that is not
 *   `/segment(/segment)*`, or neither key present.
 */
export function normalizeApiSurface(
  raw: unknown,
): ApiSurface | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'server.api must be an object ({ hosts?, prefix? })',
      details: { key: 'server.api' },
    });
  }
  for (const key of Object.keys(raw)) {
    if (key !== 'hosts' && key !== 'prefix' && key !== 'trustForwardedHost') {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `server.api: unknown option '${key}' (valid: hosts, prefix, trustForwardedHost)`,
        details: { key: `server.api.${key}` },
      });
    }
  }
  const { hosts: rawHosts, prefix, trustForwardedHost } = raw as {
    hosts?: unknown;
    prefix?: unknown;
    trustForwardedHost?: unknown;
  };
  if (
    trustForwardedHost !== undefined && typeof trustForwardedHost !== 'boolean'
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'server.api.trustForwardedHost must be a boolean',
      details: {
        key: 'server.api.trustForwardedHost',
        value: trustForwardedHost,
      },
    });
  }
  const hosts = new Set<string>();
  if (rawHosts !== undefined) {
    if (!Array.isArray(rawHosts)) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'server.api.hosts must be an array of hostnames',
        details: { key: 'server.api.hosts' },
      });
    }
    for (const entry of rawHosts) {
      const host = typeof entry === 'string'
        ? normalizeHostname(entry)
        : undefined;
      if (host === undefined) {
        throw new RapidError('RAPID_CONFIG', {
          message: `server.api.hosts: '${
            String(entry)
          }' is not a hostname (no scheme, path or query)`,
          details: { key: 'server.api.hosts', value: entry },
        });
      }
      hosts.add(host);
    }
  }
  if (
    prefix !== undefined &&
    (typeof prefix !== 'string' || !/^(\/[^/?#\s]+)+$/.test(prefix))
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        "server.api.prefix must be a path like '/api' — leading slash, no trailing slash, no query",
      details: { key: 'server.api.prefix', value: prefix },
    });
  }
  if (hosts.size === 0 && prefix === undefined) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'server.api needs at least one of hosts / prefix',
      details: { key: 'server.api' },
    });
  }
  return Object.freeze({
    hosts,
    ...(prefix !== undefined ? { prefix: prefix as string } : {}),
    trustForwardedHost: trustForwardedHost === true,
  });
}

/**
 * The hostname a request addressed. `x-forwarded-host` is read ONLY when
 * `trustForwardedHost` is on AND under the `trustProxy` hop policy (the
 * same count `resolveClientAddress` uses for `x-forwarded-for`): with N
 * trusted proxies the entry N from the end is the one the outermost
 * trusted proxy recorded. A malformed forwarded value falls back to the
 * URL's own host.
 */
export function requestHostname(
  url: URL,
  headers: Headers,
  trustProxy: boolean | number | undefined,
  trustForwardedHost: boolean,
): string {
  const hops = trustProxy === true
    ? 1
    : trustProxy === false || trustProxy === undefined
    ? 0
    : trustProxy;
  if (trustForwardedHost && hops > 0) {
    const forwarded = (headers.get('x-forwarded-host') ?? '')
      .split(',').map((h) => h.trim()).filter((h) => h.length > 0);
    if (forwarded.length > 0) {
      const host = normalizeHostname(
        forwarded[Math.max(0, forwarded.length - hops)]!,
      );
      if (host !== undefined) return host;
    }
  }
  return url.hostname.endsWith('.') ? url.hostname.slice(0, -1) : url.hostname;
}

/**
 * `pathname` with the api `prefix` removed when it lies under it (exact
 * segment match — `/api` and `/api/…`, never `/apix`), else `undefined`.
 */
export function stripApiPrefix(
  pathname: string,
  prefix: string | undefined,
): string | undefined {
  if (prefix === undefined) return undefined;
  if (pathname === prefix) return '/';
  if (!pathname.startsWith(prefix + '/')) return undefined;
  return pathname.slice(prefix.length);
}

/**
 * Decide the request's surface and the pathname to route on. The prefix
 * is stripped whenever it matches (routing is the same on both
 * surfaces); the surface is `'api'` when the UI is disabled app-wide,
 * the prefix matched, or the hostname is an api host.
 */
export function resolveSurface(
  hostname: string,
  pathname: string,
  api: ApiSurface | undefined,
  uiEnabled: boolean,
): { surface: RapidContextSurface; pathname: string; basePath: string } {
  const stripped = api === undefined
    ? undefined
    : stripApiPrefix(pathname, api.prefix);
  const surface: RapidContextSurface =
    !uiEnabled || stripped !== undefined || api?.hosts.has(hostname) === true
      ? 'api'
      : 'ui';
  return {
    surface,
    pathname: stripped ?? pathname,
    basePath: stripped !== undefined ? api!.prefix! : '',
  };
}

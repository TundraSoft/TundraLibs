/**
 * @fileoverview Instance-level configuration options type for RESTler clients.
 *
 * @module
 */
import type { RESTlerContentType } from './RESTlerContentType.ts';
import type { RESTlerAuth } from './RESTlerAuth.ts';
import type { Witness } from './Witness.ts';
import type { RESTlerHeaderProvider } from './RESTlerHeaderProvider.ts';
import type { TLSOptions } from '@tundralibs/compat/common';

/**
 * Instance-level configuration for a RESTler client
 *
 * Endpoint-level fields in {@link RESTlerEndpoint} override the matching
 * options here on a per-request basis.
 */
export type RESTlerOptions = {
  /**
   * Base URL for all API requests.
   * Can include {version} placeholder that will be replaced with the version.
   */
  baseURL: string;

  /**
   * Optional port number for API requests.
   * Must be between 1 and 65535.
   */
  port?: number;

  /**
   * Optional default headers to include with every request.
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in seconds. Must be between 1 and 120.
   * @default 30
   */
  timeout?: number;

  /**
   * Optional default content type for requests.
   * Default: 'JSON'
   */
  contentType?: RESTlerContentType;

  /**
   * Optional API version string.
   * Will replace {version} placeholders in URLs and headers.
   */
  version?: string;

  /**
   * Optional Unix domain socket path for socket-based requests.
   * If provided, requests will be made through the Unix socket instead of HTTP.
   */
  socketPath?: string;

  /**
   * TLS configuration for secure connections. Supply either inline PEM
   * (`cert` / `key` / `ca`) or file paths (`certFile` / `keyFile` /
   * `caFile`) — the two styles are mutually exclusive — plus the
   * optional `rejectUnauthorized` flag.
   * @see {@link TLSOptions}
   */
  tls?: TLSOptions;

  /**
   * Optional authentication configuration — a discriminated union keyed
   * by `type`: `BASIC` (`{ username, password }`), `BEARER`
   * (`{ token, prefix? }`), or `CUSTOM` (arbitrary fields).
   * @see {@link RESTlerAuth}
   */
  auth?: RESTlerAuth;

  /**
   * Optional observability wrap hook — the suite's **Witness** convention.
   * Every request runs through it (`tracer.wrapClient` opens a CLIENT span
   * per request). Wired at the application's composition root; RESTler
   * never imports a tracing package.
   * @see {@link Witness}
   */
  witness?: Witness;

  /**
   * Optional per-request outbound header seam. Called once per request;
   * its headers layer between the client's default `headers` and the
   * endpoint's own (`defaults < provider < endpoint.headers`, auth always
   * wins). `tracer.propagation` supplies a W3C `traceparent` here; a plain
   * thunk over the ambient bag propagates a correlation id. A thrown
   * provider is contained — the request proceeds without its headers.
   * @see {@link RESTlerHeaderProvider}
   */
  headerProvider?: RESTlerHeaderProvider;
};

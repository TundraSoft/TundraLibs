/**
 * @fileoverview Per-endpoint request configuration type for RESTler clients.
 *
 * @module
 */
import type { RESTlerAuth } from './RESTlerAuth.ts';
import type { RESTlerMethod } from './RESTlerMethod.ts';
import type { RESTlerMethodPayload } from './RESTlerMethodPayload.ts';
/**
 * Configuration for a single RESTler API endpoint
 *
 * Fields that overlap with {@link RESTlerOptions} (`baseURL`, `port`,
 * `version`, `timeout`, `auth`) override the instance-level value for this
 * one request.
 */
export type RESTlerEndpoint<M extends RESTlerMethod = RESTlerMethod> = {
  /**
   * The path part of the URL (e.g., "/users/{id}").
   * Can include {version} placeholder that will be replaced with the version.
   *
   * NORMALIZED via `path.join` against the base URL's pathname: a literal
   * `//` collapses and `.`/`..` segments resolve, the same as joining
   * filesystem paths. Fine — desirable, even — for ordinary hierarchical
   * paths, but a hazard if a segment embeds an opaque, caller-controlled
   * token (an object-storage key, a filename): a key containing `..` or
   * `//` silently resolves to a DIFFERENT endpoint instead of erroring.
   * Percent-encode such a token yourself first (including internal `/`
   * as `%2F`) if it could plausibly contain those sequences.
   */
  path: string;

  /**
   * Optional base URL for this specific endpoint.
   * Overrides the baseURL from RESTlerOptions if provided.
   */
  baseURL?: string;

  /**
   * Optional port number for this specific endpoint.
   * Overrides the port from RESTlerOptions if provided.
   */
  port?: number;

  /**
   * Optional version for this specific endpoint.
   * Overrides the version from RESTlerOptions if provided.
   */
  version?: string;

  /**
   * Per-endpoint authentication (discriminated union) that overrides the
   * instance-level `auth` for this request.
   * @see {@link RESTlerAuth}
   */
  auth?: RESTlerAuth;

  /**
   * Optional query parameters to add to the URL.
   * Values can include {version} placeholder.
   */
  query?: Record<string, string>;

  /**
   * Headers for the request.
   */
  headers?: Record<string, string>;

  /**
   * Timeout for the request in seconds.
   * Overrides the timeout from RESTlerOptions if provided.
   */
  timeout?: number;

  /**
   * How to read the response body. Defaults to text-based parsing (JSON/XML
   * by `Content-Type`); set `'BLOB'` or `'ARRAY_BUFFER'` for binary responses,
   * which are otherwise corrupted by being read as text.
   */
  responseType?: 'BLOB' | 'ARRAY_BUFFER';
} & RESTlerMethodPayload<M>;

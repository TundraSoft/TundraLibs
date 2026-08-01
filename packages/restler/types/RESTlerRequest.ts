/**
 * @fileoverview Fully-resolved request type produced from an endpoint config.
 *
 * @module
 */
import type { RESTlerMethod } from './RESTlerMethod.ts';
import type { RESTlerMethodPayload } from './RESTlerMethodPayload.ts';

/**
 * Fully-resolved request ready to be executed
 *
 * Produced internally from a {@link RESTlerEndpoint} once defaults, version
 * substitution, and auth have been applied.
 *
 * @typeParam M - The HTTP method for this request
 */
export type RESTlerRequest<M extends RESTlerMethod = RESTlerMethod> = {
  /**
   * Complete URL for the request, including protocol, host, port, path and query parameters.
   */
  url: string;

  /**
   * Headers for the request.
   */
  headers?: Record<string, string>;

  /**
   * Timeout for the request in seconds.
   */
  timeout: number;
} & RESTlerMethodPayload<M>;

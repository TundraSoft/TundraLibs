import type { RESTlerMethod, RESTlerMethodPayload } from './Method.ts';

/**
 * Additional options for a request.
 */
export type RESTlerRequestOptions = {
  /**
   * Optional timeout for this specific request in seconds.
   * Overrides the timeout from RESTlerOptions if provided.
   */
  timeout?: number;

  /**
   * Optional headers for this specific request.
   * These are merged with the default headers from RESTlerOptions.
   */
  headers?: Record<string, string>;
};

/**
 * Complete request configuration ready to be executed.
 *
 * @template M The HTTP method for this request
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

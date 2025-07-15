import { RESTlerError } from '../errors/mod.ts';
import type { RESTlerRequest } from './Request.ts';
import type { RESTlerResponse } from './Response.ts';

/**
 * Event handlers for RESTler clients.
 * Defines the events that can be emitted by RESTler instances.
 */
export type RESTlerEvents = {
  /**
   * Called after each API request is made.
   *
   * @param vendor - Vendor identifier of the RESTler client implementation
   * @param request - The request that was made
   * @param response - The response received
   * @param error - Optional error if the request failed
   */
  call: (
    vendor: string,
    request: RESTlerRequest,
    response: RESTlerResponse,
    error?: RESTlerError,
  ) => void;

  /**
   * Called when an authentication failure occurs.
   * This is emitted when the response status code matches one of the codes in _authStatus.
   *
   * @param vendor - Vendor identifier of the RESTler client implementation
   * @param request - The request that triggered the authentication failure
   * @param response - The response containing the authentication error
   */
  authFailure: (
    vendor: string,
    request: RESTlerRequest,
    response: RESTlerResponse,
  ) => void;

  /**
   * Called when rate limiting is detected.
   * This is emitted when the response status code matches one of the codes in _rateLimitStatus.
   *
   * @param vendor - Vendor identifier of the RESTler client implementation
   * @param limit - Optional rate limit value extracted from headers
   * @param reset - Optional time (in seconds) when the rate limit will reset
   * @param remaining - Optional number of requests remaining in the current time window
   */
  rateLimit: (
    vendor: string,
    limit?: number,
    reset?: number,
    remaining?: number,
  ) => void;

  /**
   * Called for tracking custom events.
   *
   * @param vendor - Vendor identifier of the RESTler client implementation
   * @param type - Type of tracking event
   * @param data - Data associated with the tracking event
   */
  track: (vendor: string, name: string, data: unknown) => void;
};

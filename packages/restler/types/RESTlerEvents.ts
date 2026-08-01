/**
 * @fileoverview Event map describing the events a RESTler client emits.
 *
 * @module
 */
import { RESTlerError } from '../errors/mod.ts';
import type { RESTlerRequest } from './RESTlerRequest.ts';
import type { RESTlerResponse } from './RESTlerResponse.ts';

/**
 * Event handler signatures emitted by RESTler instances
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
   * Called when authentication is made.
   * This is emitted by the implementation class when authentication is made successfully.
   * It is available so that the credentials can be logged/stored for repeated use.
   *
   * @param vendor - Vendor identifier of the RESTler client implementation
   * @param data - The authentication data, which can be any type
   *              (e.g., token, username/password, etc.) depending on the authentication method used.
   *              This is optional and can be undefined if no data is available.
   */
  authentication: (
    vendor: string,
    data?: unknown,
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
   * @param name - Name of the tracking event
   * @param data - Data associated with the tracking event
   */
  track: (vendor: string, name: string, data: unknown) => void;
};

import type { RESTlerRequest } from '../types/mod.ts';
import { RESTlerError, RESTlerErrorMeta } from './Base.ts';

/**
 * Error class for request-related errors in RESTler.
 * Thrown when a request fails for network, parsing, or other non-HTTP-status reasons.
 */
export class RESTlerRequestError
  extends RESTlerError<RESTlerErrorMeta & { request: RESTlerRequest }> {
  /**
   * Creates a new RESTlerRequestError.
   *
   * @param message - Error message describing the request issue
   * @param meta - Error metadata containing the vendor identifier and the request that failed
   * @param cause - Optional underlying cause of this error
   */
  constructor(
    message: string,
    meta: RESTlerErrorMeta & { request: RESTlerRequest },
    cause?: Error,
  ) {
    super(
      message,
      meta,
      cause,
    );
  }
}

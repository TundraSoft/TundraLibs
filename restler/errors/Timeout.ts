import type { RESTlerRequest } from '../types/mod.ts';
import { RESTlerRequestError } from './Request.ts';
import { RESTlerErrorMeta } from './Base.ts';

/**
 * Error class for timeout-related errors in RESTler.
 * Thrown when a request exceeds its configured timeout duration.
 */
export class RESTlerTimeoutError extends RESTlerRequestError {
  /**
   * Creates a new RESTlerTimeoutError.
   *
   * @param meta - Error metadata containing the vendor identifier and the request that timed out
   * @param cause - Optional underlying cause of this error
   */
  constructor(
    meta: RESTlerErrorMeta & { request: RESTlerRequest },
    cause?: Error,
  ) {
    super(
      'Request timed out after ${request.timeout}s',
      meta,
      cause,
    );
  }
}

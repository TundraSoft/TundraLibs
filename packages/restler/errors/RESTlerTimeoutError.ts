/**
 * @fileoverview Error raised when a RESTler request exceeds its timeout.
 *
 * @module
 */

import type { RESTlerRequest } from '../types/mod.ts';
import { RESTlerRequestError } from './RESTlerRequestError.ts';
import { RESTlerErrorMeta } from './Base.ts';

/**
 * Thrown when a request is aborted because it ran past the request's `timeout`
 *
 * A {@link RESTlerRequestError} subclass raised when the request's timeout timer
 * aborts it — covering both the `fetch` itself and the reading of the response
 * body. The message is fixed and the metadata's `request` holds the timed-out
 * {@link RESTlerRequest}, whose `timeout` (in seconds) was exceeded.
 */
export class RESTlerTimeoutError extends RESTlerRequestError {
  /**
   * Build the error with a fixed timeout message and the timed-out `request`
   *
   * @param meta - Metadata carrying `vendor` and the timed-out `request`
   * @param cause - Underlying abort/timeout error that triggered this one, if any
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

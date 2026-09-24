/**
 * @fileoverview Error raised when a vendor rate-limits a request and it was
 * not retried, or was retried and rate-limited again.
 *
 * @module
 */

import type { RESTlerRequest } from '../types/mod.ts';
import { RESTlerRequestError } from './RESTlerRequestError.ts';
import { RESTlerErrorMeta } from './Base.ts';

/**
 * Thrown when a request is rate-limited and no (further) retry is possible.
 *
 * Raised in every terminal rate-limit case, distinguished by its metadata
 * rather than by type:
 *
 * - the vendor gave no readable retry hint (`retryAfter` undefined);
 * - the hint exceeded `maxRetryWait`, so waiting was refused;
 * - the single permitted retry was itself rate-limited (`retried` true);
 * - the request body was a stream, which cannot be replayed.
 *
 * `retryAfter` carries the parsed wait in SECONDS when one was readable, so a
 * caller can schedule its own retry instead of guessing — and `retried` says
 * whether a silent wait already happened, which a caller staring at an error
 * after an unexplained pause deserves to know.
 */
export class RESTlerRateLimitError extends RESTlerRequestError {
  /**
   * Build the error with the rate-limited request and what was learned.
   *
   * @param meta - `vendor`, the `request`, the parsed `retryAfter` in seconds
   *   when the vendor gave a readable one, and whether a retry was already
   *   spent.
   * @param cause - Underlying error, if any.
   */
  constructor(
    meta: RESTlerErrorMeta & {
      request: RESTlerRequest;
      retryAfter?: number;
      retried: boolean;
    },
    cause?: Error,
  ) {
    super(
      'Request was rate limited by ${vendor}',
      meta,
      cause,
    );
  }
}

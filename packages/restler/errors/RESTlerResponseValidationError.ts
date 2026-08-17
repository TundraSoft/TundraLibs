/**
 * @fileoverview Error raised when a response fails its `responseSchema`.
 *
 * @module
 */

import type { RESTlerRequest } from '../types/mod.ts';
import { RESTlerRequestError } from './RESTlerRequestError.ts';
import { RESTlerErrorMeta } from './Base.ts';

/**
 * Thrown when the `responseSchema` passed to `_makeRequest` rejects a
 * response
 *
 * A {@link RESTlerRequestError} subclass — distinct from a transport
 * failure or timeout: the request itself SUCCEEDED, but what came back
 * didn't match what the caller declared to expect (a `GuardianError`, or
 * whatever the schema function threw, preserved as `cause`). Callers can
 * `instanceof` this to handle "the vendor's response doesn't match its
 * contract anymore" differently from a network failure — retrying a
 * validation failure won't fix it the way retrying a timeout might.
 */
export class RESTlerResponseValidationError extends RESTlerRequestError {
  /**
   * Build the error with a fixed message and the request whose response
   * failed validation
   *
   * @param meta - Metadata carrying `vendor` and the `request`
   * @param cause - The error `responseSchema` threw
   */
  constructor(
    meta: RESTlerErrorMeta & { request: RESTlerRequest },
    cause: Error,
  ) {
    super('Response failed schema validation', meta, cause);
  }
}

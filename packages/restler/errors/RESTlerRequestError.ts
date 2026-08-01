/**
 * @fileoverview Error raised when a RESTler request fails to complete.
 *
 * @module
 */

import type { RESTlerRequest } from '../types/mod.ts';
import { RESTlerError, RESTlerErrorMeta } from './Base.ts';

/**
 * Thrown when a request fails for a non-timeout reason such as a network error or
 * an unexpected failure during dispatch
 *
 * The originating transport error is preserved as the error `cause`, and the metadata's
 * `request` holds the fully-resolved {@link RESTlerRequest}. Both are credential-safe:
 * the `request.url` is redacted, and the request URL is scrubbed from the `cause`
 * chain's `message`/`stack` (some runtimes embed the credential-bearing URL there),
 * so no serialization surface — including a cause-expanding `console.error(err)` —
 * leaks a query-string credential or `user:pass@` userinfo. Timeouts surface as the
 * {@link RESTlerTimeoutError} subclass instead.
 */
export class RESTlerRequestError
  extends RESTlerError<RESTlerErrorMeta & { request: RESTlerRequest }> {
  /**
   * Build the error, recording the failed `request` from the metadata
   *
   * @param message - Description of why the request failed
   * @param meta - Metadata carrying `vendor` and the failed `request`
   * @param cause - Underlying transport error that triggered this one, if any
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

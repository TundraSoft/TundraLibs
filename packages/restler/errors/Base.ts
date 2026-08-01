/**
 * @fileoverview Base error type and metadata shape shared by all RESTler errors.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils/BaseError';

/**
 * Metadata carried by every RESTler error
 *
 * Always includes the `vendor` identifier of the client implementation; subclasses
 * intersect this with their own fields (e.g. `key`/`value`, `request`).
 */
export type RESTlerErrorMeta = {
  /** Vendor identifier of the RESTler client implementation */
  vendor: string;
} & Record<string, unknown>;

/**
 * Base class for all RESTler errors, thrown directly only when no more specific
 * subclass applies
 *
 * Extends {@link BaseError} with RESTler metadata; concrete failures surface as
 * {@link RESTlerConfigError}, {@link RESTlerRequestError}, or
 * {@link RESTlerTimeoutError}.
 *
 * @typeParam M - Metadata shape, defaulting to {@link RESTlerErrorMeta}
 */
export class RESTlerError<M extends RESTlerErrorMeta = RESTlerErrorMeta>
  extends BaseError<M> {
  /**
   * Build the error from a message and metadata carrying the client `vendor`
   *
   * @param message - Human-readable description of the failure
   * @param meta - Metadata carrying at least the client `vendor`
   * @param cause - Underlying error that triggered this one, if any
   */
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}

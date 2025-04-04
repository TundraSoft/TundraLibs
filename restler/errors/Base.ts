import { BaseError } from '@tundralibs/utils';

/**
 * Metadata for RESTler errors.
 * All RESTler errors include at minimum the vendor identifier of the client implementation.
 */
export type RESTlerErrorMeta = {
  /** Vendor identifier of the RESTler client implementation */
  vendor: string;
} & Record<string, unknown>;

/**
 * Base error class for all RESTler errors.
 * Extends BaseError from @tundralibs/utils with RESTler-specific metadata.
 *
 * @template M Type of error metadata, must extend RESTlerErrorMeta
 */
export class RESTlerError<M extends RESTlerErrorMeta = RESTlerErrorMeta>
  extends BaseError<M> {
  /**
   * Creates a new RESTlerError.
   *
   * @param message - Error message
   * @param meta - Error metadata containing at least the client vendor
   * @param cause - Optional underlying cause of this error
   */
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}

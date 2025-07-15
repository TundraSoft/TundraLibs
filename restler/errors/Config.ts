import { RESTlerError, RESTlerErrorMeta } from './Base.ts';

/**
 * Error class for configuration-related errors in RESTler.
 * Thrown when an invalid configuration option is provided.
 */
export class RESTlerConfigError
  extends RESTlerError<RESTlerErrorMeta & { key: string; value?: unknown }> {
  /**
   * Creates a new RESTlerConfigError.
   *
   * @param message - Error message describing the configuration issue
   * @param meta - Error metadata containing the vendor identifier, the problematic config key, and its value
   * @param cause - Optional underlying cause of this error
   */
  constructor(
    message: string,
    meta: RESTlerErrorMeta & { key: string; value?: unknown },
    cause?: Error,
  ) {
    super(message, meta, cause);
  }
}

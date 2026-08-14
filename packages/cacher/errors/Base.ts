import { BaseError } from '@tundralibs/utils';
/**
 * Base error class for all Cacher errors.
 * Extends BaseError from @tundralibs/utils with Cacher-specific metadata.
 *
 * @template M Type of error metadata, must extend CacherErrorMeta
 */
export class CacherError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  /**
   * Passes the constructor's `message` through verbatim — Manager errors are
   * written as complete sentences at the throw site rather than assembled from
   * metadata.
   *
   * @protected
   */
  protected override get _messageTemplate(): string {
    return '${message}';
  }
  /**
   * Creates a new CacherError.
   *
   * @param message - Error message
   * @param meta - Error metadata containing at least the name and engine
   * @param cause - Optional underlying cause of this error
   */
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}

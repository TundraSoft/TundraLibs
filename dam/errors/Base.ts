import { BaseError } from '@tundralibs/utils';
/**
 * Base error class for DAM.
 * Extends BaseError from @tundralibs/utils with Cacher-specific metadata.
 *
 * @template M Type of error metadata.
 */
export class DAMError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  protected override get _messageTemplate(): string {
    return '${message}';
  }
  /**
   * Creates a new DAMError.
   *
   * @param message - Error message
   * @param meta - Error metadata containing at least the name and engine
   * @param cause - Optional underlying cause of this error
   */
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}

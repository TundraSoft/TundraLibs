import { BaseError } from '@tundralibs/utils';
import { Engine } from '../Engines.ts';
/**
 * Metadata for Cacher errors.
 * All Cacher errors include at minimum the name and engine of the cacher implementation.
 */
export type CacherErrorMeta = {
  /** The cacher instance name */
  name: string;
  /** The Engine */
  engine: Engine;
} & Record<string, unknown>;

/**
 * Base error class for all Cacher errors.
 * Extends BaseError from @tundralibs/utils with Cacher-specific metadata.
 *
 * @template M Type of error metadata, must extend CacherErrorMeta
 */
export class CacherError<M extends CacherErrorMeta = CacherErrorMeta>
  extends BaseError<M> {
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

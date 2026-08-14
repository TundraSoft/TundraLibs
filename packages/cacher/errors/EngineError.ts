import { CacherError } from './Base.ts';
import {
  type CacherEngineErrorCode,
  CacherEngineErrorCodes,
} from './EngineErrorCodes.ts';
/**
 * Metadata for Cacher errors.
 * All Cacher errors include at minimum the name and engine of the cacher implementation.
 */
export type CacherErrorMeta = {
  /** The cacher instance name */
  name: string;
  /** The Engine */
  engine: string;
  /** Original Error code. Present if the code is invalid */
  originalCode?: string;
} & Record<string, unknown>;

/**
 * Base error class for all Cacher errors.
 * Extends BaseError from @tundralibs/utils with Cacher-specific metadata.
 *
 * @template M Type of error metadata, must extend CacherErrorMeta
 */
export class CacherEngineError<M extends CacherErrorMeta = CacherErrorMeta>
  extends CacherError<M> {
  /**
   * The error code this instance was constructed with, for programmatic
   * branching. An unrecognised code is coerced to `'UNKNOWN_ERROR'` and the
   * original preserved on `meta.originalCode`.
   */
  public readonly code: CacherEngineErrorCode;

  /**
   * Passes the resolved message through verbatim — the constructor has already
   * mapped `code` to its template in {@link CacherEngineErrorCodes}.
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
  constructor(code: CacherEngineErrorCode, meta: M, cause?: Error) {
    // Handle cases where error code is not present in CacherErrorCodes
    if (!CacherEngineErrorCodes[code]) {
      meta.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }
    super(CacherEngineErrorCodes[code], meta, cause);
    this.code = code;
  }
}

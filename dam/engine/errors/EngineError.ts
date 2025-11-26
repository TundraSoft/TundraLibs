import { DAMError } from '../../errors/mod.ts';
import {
  type DAMEngineErrorCode,
  DAMEngineErrorCodes,
} from './EngineErrorCodes.ts';
/**
 * Metadata for Cacher errors.
 * All Cacher errors include at minimum the name and engine of the cacher implementation.
 */
export type DAMEngineErrorMeta = {
  instanceId: string;
  name: string;
  engine: string;
  /** Original Error code. Present if the code is invalid */
  originalCode?: string;
} & Record<string, unknown>;

/**
 * Base error class for all DAMEngine errors.
 * Extends DAMError which is the base for DAM.
 *
 * @template M Type of error metadata, must extend DAMEngineErrorMeta
 * @see {@link DAMError}
 * @see {@link DAMEngineErrorCodes}
 * @see {@link DAMEngineErrorMeta}
 */
export class DAMEngineError<M extends DAMEngineErrorMeta = DAMEngineErrorMeta>
  extends DAMError<M> {
  public readonly code: DAMEngineErrorCode;
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
  constructor(code: DAMEngineErrorCode, meta: M, cause?: Error) {
    // Handle cases where error code is not present in CacherErrorCodes
    if (!DAMEngineErrorCodes[code]) {
      meta.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }
    super(DAMEngineErrorCodes[code], meta, cause);
    this.code = code;
  }
}

import { DAMError } from '../Base.ts';

/**
 * Metadata common to all DAM engine errors
 *
 * @property name - The engine instance name
 * @property engine - The engine type identifier
 */
export type DAMEngineErrorMeta = {
  name: string;
  engine: string;
} & Record<string, unknown>;

/**
 * Base error class for all database engine errors
 *
 * Provides context-rich error information with engine details and optional cause.
 *
 * @template M The metadata type, extending DAMEngineErrorMeta
 *
 * @example
 * ```typescript
 * throw new DAMEngineError('Failed to execute query', {
 *   name: 'main-db',
 *   engine: 'POSTGRES'
 * });
 * ```
 */
export class DAMEngineError<M extends DAMEngineErrorMeta = DAMEngineErrorMeta>
  extends DAMError<M> {
  /**
   * Creates a new DAMEngineError
   *
   * @param message - Error message
   * @param meta - Error metadata including engine information
   * @param cause - Optional underlying error that caused this error
   */
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}

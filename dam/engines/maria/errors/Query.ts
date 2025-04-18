import { SqlError } from '$maria';
import {
  type DAMEngineErrorMeta,
  DAMEngineQueryError,
} from '../../errors/mod.ts';
import type { Query } from '../../../query/mod.ts';

/**
 * MariaDB-specific query execution error
 *
 * Enhances the base query error with MariaDB-specific error detection
 * and improved error messages based on MariaDB error codes.
 *
 * @example
 * ```typescript
 * throw new MariaEngineQueryError(
 *   { name: 'main-db', query: { sql: 'SELECT * FROM non_existent_table' } },
 *   new PostgresError('relation "non_existent_table" does not exist')
 * );
 * ```
 */
export class MariaEngineQueryError extends DAMEngineQueryError<
  DAMEngineErrorMeta & {
    query: Query;
  }
> {
  /**
   * Creates a MariaDB-specific query error
   *
   * Maps MariaDB error codes to more user-friendly messages.
   *
   * @param meta - Error metadata including query details
   * @param cause - The underlying MariaDB error
   */
  constructor(
    meta: { name: string; query: Query },
    cause?: Error,
  ) {
    let message = cause?.message || 'Failed to execute Postgres query';

    // Extract and translate Maria-specific error codes
    if (cause instanceof SqlError) {
      // MariaDB-specific error handling
      switch (cause.code) {
        case 'ER_DUP_ENTRY':
          message = 'Unique constraint violation';
          break;
        case 'ER_NO_REFERENCED_ROW':
          message = 'Foreign key constraint violation';
          break;
        case 'ER_PARSE_ERROR':
          message = 'Syntax error in SQL statement';
          break;
        case 'ER_BAD_TABLE_ERROR':
          message = 'Could not find table or view';
          break;
        case 'ER_LOCK_WAIT_TIMEOUT':
          message = 'Lock wait timeout exceeded';
          break;
        case 'ER_QUERY_TIMEOUT':
          message = 'Query timed out when executing Postgres query';
          break;
      }
    }

    super(message, { engine: 'POSTGRES', ...meta }, cause);
  }
}

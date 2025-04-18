import { PostgresError } from '$postgres2';
import {
  type DAMEngineErrorMeta,
  DAMEngineQueryError,
} from '../../errors/mod.ts';
import type { Query } from '../../../query/mod.ts';

/**
 * PostgreSQL-specific query execution error
 *
 * Enhances the base query error with PostgreSQL-specific error detection
 * and improved error messages based on PostgreSQL error codes.
 *
 * @example
 * ```typescript
 * throw new PostgresEngineQueryError(
 *   { name: 'main-db', query: { sql: 'SELECT * FROM non_existent_table' } },
 *   new PostgresError('relation "non_existent_table" does not exist')
 * );
 * ```
 */
export class PostgresEngineQueryError extends DAMEngineQueryError<
  DAMEngineErrorMeta & {
    query: Query;
  }
> {
  /**
   * Creates a PostgreSQL-specific query error
   *
   * Maps PostgreSQL error codes to more user-friendly messages.
   *
   * @param meta - Error metadata including query details
   * @param cause - The underlying PostgreSQL error
   */
  constructor(
    meta: { name: string; query: Query },
    cause?: Error,
  ) {
    let message = cause?.message || 'Failed to execute Postgres query';

    // Extract and translate PostgreSQL-specific error codes
    if (cause instanceof PostgresError) {
      if (cause.name === 'QueryTimeout') {
        message = 'Query timed out when executing Postgres query';
      } else if (cause.fields) {
        // Map error codes to better messages
        // See: https://www.postgresql.org/docs/current/errcodes-appendix.html
        switch (cause.fields.code) {
          case '23505':
            message = 'Unique constraint violation';
            break;
          case '23503':
            message = 'Foreign key constraint violation';
            break;
          case '42601':
            message = 'Syntax error in SQL statement';
            break;
          case '42P01':
            message = 'Could not find table or view';
            break;
          case '42703':
            message = 'Column does not exist in table or view';
            break;
          default:
            message = cause.message;
        }
      } else if (cause.name === 'QueryError') {
        message = cause.message;
      }
    }

    super(message, { engine: 'POSTGRES', ...meta }, cause);
  }
}

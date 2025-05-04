import { PostgresError } from '$postgres';
import {
  type DAMEngineErrorMeta,
  DAMEngineQueryError,
} from '../../../errors/mod.ts';
import type { Query } from '../../../types/mod.ts';

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
          // Constraint violations
          case '23505':
            message = 'Unique constraint violation';
            break;
          case '23503':
            message = 'Foreign key constraint violation';
            break;
          case '23514':
            message = 'Check constraint violation';
            break;
          case '23502':
            message = 'Not null constraint violation';
            break;

          // Syntax and semantics errors
          case '42601':
            message = 'Syntax error in SQL statement';
            break;
          case '42P01':
            message = 'Could not find table or view';
            break;
          case '42P02':
            message = 'Parameter name not found';
            break;
          case '42703':
            message = 'Column does not exist in table or view';
            break;
          case '42P03':
            message = 'Duplicate cursor name';
            break;
          case '42P04':
            message = 'Duplicate database name';
            break;
          case '42P05':
            message = 'Duplicate prepared statement name';
            break;
          case '42P06':
            message = 'Duplicate schema name';
            break;
          case '42P07':
            message = 'Duplicate table name';
            break;
          case '42P08':
            message = 'Ambiguous parameter name';
            break;
          case '42P09':
            message = 'Ambiguous function name';
            break;
          case '42P10':
            message = 'Invalid column reference';
            break;
          case '42611':
            message = 'Invalid column definition';
            break;
          case '42846':
            message = 'Type conversion error';
            break;

          // Data type errors
          case '22001':
            message = 'String data right truncation';
            break;
          case '22003':
            message = 'Numeric value out of range';
            break;
          case '22007':
            message = 'Invalid datetime format';
            break;
          case '22008':
            message = 'Datetime field overflow';
            break;
          case '22012':
            message = 'Division by zero';
            break;
          case '22P02':
            message = 'Invalid text representation';
            break;

          // Insufficient resources
          case '53100':
            message = 'Disk full';
            break;
          case '53200':
            message = 'Out of memory';
            break;
          case '53300':
            message = 'Too many connections';
            break;

          // Transaction errors
          case '40001':
            message = 'Serialization failure (deadlock detected)';
            break;
          case '40002':
            message = 'Transaction integrity constraint violation';
            break;
          case '40003':
            message = 'Statement completion unknown';
            break;
          case '40P01':
            message = 'Deadlock detected';
            break;

          // Authorization errors
          case '42501':
            message = 'Insufficient privilege to execute query';
            break;
          case '28P01':
            message = 'Invalid password';
            break;

          // System errors
          case '58030':
            message = 'IO error';
            break;
          case '57014':
            message = 'Query canceled';
            break;

          // Default to using the original message
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

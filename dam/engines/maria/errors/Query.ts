import { SqlError } from '$maria';
import {
  type DAMEngineErrorMeta,
  DAMEngineQueryError,
} from '../../../errors/mod.ts';
import type { Query } from '../../../types/mod.ts';

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
 *   new SqlError('Table does not exist')
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
    let message = cause?.message || 'Failed to execute MariaDB query';

    // Extract and translate Maria-specific error codes
    if (cause instanceof SqlError) {
      // MariaDB-specific error handling
      switch (cause.code) {
        // Constraint violations
        case 'ER_DUP_ENTRY':
          message = 'Unique constraint violation';
          break;
        case 'ER_NO_REFERENCED_ROW':
        case 'ER_NO_REFERENCED_ROW_2':
          message = 'Foreign key constraint violation';
          break;
        case 'ER_ROW_IS_REFERENCED':
        case 'ER_ROW_IS_REFERENCED_2':
          message =
            'Cannot delete or update: row is referenced by a foreign key';
          break;

        // Syntax errors
        case 'ER_PARSE_ERROR':
          message = 'Syntax error in SQL statement';
          break;

        // Table errors
        case 'ER_BAD_TABLE_ERROR':
        case 'ER_NO_SUCH_TABLE':
          message = 'Could not find table or view';
          break;

        // Timeout errors
        case 'ER_LOCK_WAIT_TIMEOUT':
          message = 'Lock wait timeout exceeded';
          break;
        case 'ER_QUERY_TIMEOUT':
        case 'ER_STATEMENT_TIMEOUT':
          message = 'Query execution timed out';
          break;

        // Column errors
        case 'ER_BAD_FIELD_ERROR':
        case 'ER_UNKNOWN_COLUMN':
          message = 'Unknown column in query';
          break;

        // Data validation errors
        case 'ER_TRUNCATED_WRONG_VALUE':
          message = 'Incorrect value type for column';
          break;
        case 'ER_DATA_TOO_LONG':
          message = 'Data too long for column';
          break;
        case 'ER_DIVISION_BY_ZERO':
          message = 'Division by zero in query';
          break;

        // Permission errors
        case 'ER_TABLEACCESS_DENIED_ERROR':
          message = 'Access denied for table operation';
          break;
        case 'ER_COLUMNACCESS_DENIED_ERROR':
          message = 'Access denied for column operation';
          break;

        // Operation errors
        case 'ER_WRONG_VALUE_COUNT_ON_ROW':
          message = "Column count doesn't match value count";
          break;
        case 'ER_TABLE_EXISTS_ERROR':
          message = 'Table already exists';
          break;
        case 'ER_NOT_SUPPORTED_YET':
          message = 'Feature not supported';
          break;
        case 'ER_NO_DEFAULT':
          message = 'No default value for column';
          break;
        case 'ER_NO_SUCH_DB':
          message = 'Database does not exist';
          break;
        case 'ER_CANT_CREATE_DB':
          message = 'Cannot create database';
          break;
        case 'ER_CANT_CREATE_TABLE':
          message = 'Cannot create table';
          break;

        // Transaction errors
        case 'ER_COMMIT_NOT_ALLOWED_IN_SF_OR_TRG':
          message =
            'Transaction operations not allowed in stored function or trigger';
          break;
        case 'ER_LOCK_DEADLOCK':
          message = 'Deadlock detected, transaction rolled back';
          break;

        // Connection errors during query
        case 'PROTOCOL_CONNECTION_LOST':
          message = 'Connection lost during query execution';
          break;
      }
    }

    super(message, { engine: 'MARIA', ...meta }, cause);
  }
}

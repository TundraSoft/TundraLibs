/**
 * @fileoverview Cross-engine error code → message-template map.
 * Engines map their native errors to one of these codes so callers
 * can branch without parsing strings. Templates use `${var}`
 * placeholders filled from error metadata at message-build time.
 *
 * Common metadata variables: `instanceId` (`"Engine::Name"`),
 * `reason`, `operation`, `timeoutMs`, `constraint`, `database`,
 * `table`, `column`, `transactionId`.
 *
 * @module
 */

/**
 * Error-code → template map. See per-entry comments for the
 * variables each template expects. Used by {@link EngineError}.
 */
export const EngineErrorCodes: Record<EngineErrorCode, string> = {
  /**
   * Fallback when an unrecognized error code is passed to EngineError.
   * The original code is stored in metadata.originalCode.
   * Variables: instanceId, reason
   */
  UNKNOWN_ERROR: 'Unknown error in ${instanceId}: ${reason}',

  //#region Configuration
  /**
   * Configuration value is invalid or malformed.
   * Variables: option (config key), reason (why invalid)
   */
  INVALID_CONFIG_VALUE:
    'Configuration value for "${option}" is invalid - ${reason}',

  /**
   * Required configuration value is missing.
   * Variables: option (config key)
   */
  MISSING_CONFIG_VALUE: 'Required configuration value "${option}" is missing',
  //#endregion Configuration

  //#region Connection lifecycle
  /**
   * Failed to establish connection to database/cache.
   * Common causes: invalid host/port, network issues, auth failure.
   * Variables: instanceId
   */
  CONNECTION_FAILED: 'Failed to connect to ${instanceId}',

  /**
   * Failed to cleanly disconnect from database/cache.
   * Variables: instanceId
   */
  DISCONNECTION_FAILED: 'Failed to disconnect from ${instanceId}',

  /**
   * Attempted operation without active connection.
   * Variables: instanceId
   */
  NO_CONNECTION: 'No connection available for ${instanceId}',

  /**
   * Active connection was unexpectedly lost.
   * Variables: instanceId, reason
   */
  CONNECTION_LOST: 'Connection to ${instanceId} was lost: ${reason}',
  //#endregion Connection lifecycle

  //#region Pool
  /**
   * Attempted to acquire connection while pool is draining/shutting down.
   * Thrown during disconnect() or when pool is being torn down.
   * Variables: instanceId
   */
  POOL_DRAINING:
    'Pool for ${instanceId} is draining; new acquires are not permitted',

  /**
   * Timed out waiting for available connection from pool.
   * Common causes: pool exhausted, slow queries, pool size too small.
   * Variables: instanceId, timeoutMs
   */
  POOL_ACQUIRE_TIMEOUT:
    'Acquiring a connection from ${instanceId} timed out after ${timeoutMs}ms',

  /**
   * Failed to create new connection for pool.
   * Variables: instanceId
   */
  POOL_RESOURCE_FAILED:
    'Failed to create a new pool resource for ${instanceId}',
  //#endregion Pool

  //#region Operation
  /**
   * Generic operation failure (catch-all for engine-specific operations).
   * Variables: operation, instanceId, reason
   */
  OPERATION_FAILED:
    'Operation "${operation}" failed on ${instanceId}: ${reason}',

  /**
   * Operation is not supported by this engine type.
   * Variables: operation, instanceId
   */
  UNSUPPORTED_OPERATION:
    'Operation "${operation}" is not supported by ${instanceId}',
  //#endregion Operation

  //#region Auth (cross-engine)
  /**
   * Authentication credentials are invalid.
   * Common causes: wrong password, expired credentials, account disabled.
   * Variables: instanceId, reason
   */
  INVALID_AUTH: 'Authentication failed for ${instanceId}: ${reason}',

  /**
   * User lacks required permissions for operation.
   * Variables: instanceId, reason
   */
  PERMISSION_DENIED: 'Permission denied on ${instanceId}: ${reason}',
  //#endregion Auth

  //#region Query (SQL/document engines)
  /**
   * Required query parameters not provided.
   * Variables: instanceId, missing (comma-separated param names)
   */
  MISSING_PARAMETERS:
    'Required parameters not provided for query on ${instanceId}: ${missing}',

  /**
   * Query execution encountered an error.
   * Common causes: runtime errors, type mismatches, constraint violations.
   * Variables: instanceId, reason
   */
  QUERY_EXECUTION_FAILED: 'Query execution failed on ${instanceId}: ${reason}',

  /**
   * Query exceeded configured timeout.
   * Variables: instanceId, timeoutMs
   */
  QUERY_TIMEOUT: 'Query timed out on ${instanceId} after ${timeoutMs}ms',

  /**
   * SQL syntax is invalid.
   * Variables: instanceId, reason (syntax error details)
   */
  SYNTAX_ERROR: 'SQL syntax error on ${instanceId}: ${reason}',
  //#endregion Query

  //#region Schema (SQL/document engines)
  /**
   * Referenced database does not exist.
   * Variables: instanceId, database (database name)
   */
  DATABASE_NOT_FOUND: 'Database not found on ${instanceId}: ${database}',

  /**
   * Referenced table does not exist.
   * Variables: instanceId, table (table name)
   */
  TABLE_NOT_FOUND: 'Table not found on ${instanceId}: ${table}',

  /**
   * Referenced column does not exist.
   * Variables: instanceId, column (column name)
   */
  COLUMN_NOT_FOUND: 'Column not found on ${instanceId}: ${column}',
  //#endregion Schema

  //#region Constraints
  /**
   * Unique constraint or primary key violation.
   * Thrown on INSERT/UPDATE with duplicate value.
   * Variables: instanceId, constraint (constraint name)
   */
  DUPLICATE_KEY: 'Duplicate key violation on ${instanceId}: ${constraint}',

  /**
   * Foreign key constraint violation.
   * Thrown when referencing non-existent parent or deleting referenced row.
   * Variables: instanceId, constraint (constraint name)
   */
  FOREIGN_KEY_VIOLATION:
    'Foreign key constraint violation on ${instanceId}: ${constraint}',

  /**
   * NOT NULL constraint violation.
   * Thrown when inserting/updating NULL into NOT NULL column.
   * Variables: instanceId, column (column name)
   */
  NOT_NULL_VIOLATION:
    'NOT NULL constraint violated on ${instanceId}: ${column}',

  /**
   * CHECK constraint violation.
   * Thrown when value fails CHECK condition.
   * Variables: instanceId, constraint (constraint name)
   */
  CHECK_VIOLATION: 'CHECK constraint violated on ${instanceId}: ${constraint}',
  //#endregion Constraints

  //#region Concurrency
  /**
   * Deadlock detected between concurrent transactions.
   * Typically transient - retry the transaction with exponential backoff.
   * Variables: instanceId
   */
  DEADLOCK: 'Deadlock detected on ${instanceId}',

  /**
   * Timed out waiting for lock acquisition.
   * Variables: instanceId
   */
  LOCK_TIMEOUT: 'Lock acquisition timed out on ${instanceId}',

  /**
   * Serialization failure due to concurrent update (MVCC).
   * Common in SERIALIZABLE isolation when transactions conflict.
   * Variables: instanceId
   */
  SERIALIZATION_FAILURE:
    'Serialization failure on ${instanceId} (concurrent update)',
  //#endregion Concurrency

  //#region Transactions
  /**
   * Referenced transaction does not exist.
   * Variables: instanceId, transactionId
   */
  TRANSACTION_NOT_FOUND:
    'Transaction "${transactionId}" not found on ${instanceId}',

  /**
   * Transaction operation (begin/commit/rollback) failed.
   * Variables: operation (begin/commit/rollback), instanceId, transactionId
   */
  TRANSACTION_OPERATION_ERROR:
    'Transaction operation "${operation}" failed on ${instanceId} (txn ${transactionId})',
  //#endregion Transactions
} as const satisfies Record<string, string>;

/** Union of all keys from {@link EngineErrorCodes}. */
export type EngineErrorCode =
  | 'UNKNOWN_ERROR'
  | 'INVALID_CONFIG_VALUE'
  | 'MISSING_CONFIG_VALUE'
  | 'CONNECTION_FAILED'
  | 'DISCONNECTION_FAILED'
  | 'NO_CONNECTION'
  | 'CONNECTION_LOST'
  | 'POOL_DRAINING'
  | 'POOL_ACQUIRE_TIMEOUT'
  | 'POOL_RESOURCE_FAILED'
  | 'OPERATION_FAILED'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_AUTH'
  | 'PERMISSION_DENIED'
  | 'MISSING_PARAMETERS'
  | 'QUERY_EXECUTION_FAILED'
  | 'QUERY_TIMEOUT'
  | 'SYNTAX_ERROR'
  | 'DATABASE_NOT_FOUND'
  | 'TABLE_NOT_FOUND'
  | 'COLUMN_NOT_FOUND'
  | 'DUPLICATE_KEY'
  | 'FOREIGN_KEY_VIOLATION'
  | 'NOT_NULL_VIOLATION'
  | 'CHECK_VIOLATION'
  | 'DEADLOCK'
  | 'LOCK_TIMEOUT'
  | 'SERIALIZATION_FAILURE'
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSACTION_OPERATION_ERROR';

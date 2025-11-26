export const DAMEngineErrorCodes = {
  UNKNOWN_ERROR: 'Unknown error occurred in ${engine}::${name}: ${reason}',

  //#region Configuration Errors
  CONFIG_MISSING:
    'Configuration key ${configKey} is missing for ${engine}::${name}',
  CONFIG_INVALID:
    'Configuration value for ${configKey} is invalid in ${engine}::${name}: ${reason}',
  ENGINE_NOT_SUPPORTED: 'Engine ${engine} is not supported',
  OPTION_VALIDATION_FAILED:
    'Option validation failed for ${engine}::${name}: ${option} - ${reason}',
  //#endregion Configuration Errors

  //#region Connection Errors
  CONNECTION_FAILED: 'Failed to connect to ${engine}::${name}: ${reason}',
  CONNECTION_TIMEOUT:
    'Connection to ${engine}::${name} timed out after ${timeout} seconds',
  CONNECTION_REFUSED: 'Connection to ${engine}::${name} was refused: ${reason}',
  CONNECTION_INVALID_CREDENTIALS:
    'Invalid credentials for ${engine}::${name}: ${reason}',
  CONNECTION_LOST: 'Connection to ${engine}::${name} was lost: ${reason}',
  CONNECTION_POOL_EXHAUSTED:
    'Connection pool exhausted for ${engine}::${name}: ${activeConnections}/${maxConnections} connections in use',
  CONNECTION_POOL_TIMEOUT:
    'Failed to acquire connection from pool for ${engine}::${name} within ${timeout} seconds',
  CONNECTION_VALIDATION_FAILED:
    'Connection validation failed for ${engine}::${name}: ${reason}',
  CONNECTION_NOT_AVAILABLE:
    'No connection available for ${engine}::${name}: status is ${status}',
  //#endregion Connection Errors

  //#region Query Errors
  QUERY_EXECUTION_FAILED:
    'Query execution failed on ${engine}::${name}: ${reason}',
  QUERY_TIMEOUT:
    'Query timed out on ${engine}::${name} after ${timeout} seconds: ${sql}',
  QUERY_MISSING_PARAMETERS:
    'Query missing required parameters on ${engine}::${name}: ${missing}',
  QUERY_INVALID_SQL: 'Invalid SQL syntax on ${engine}::${name}: ${reason}',
  QUERY_PARAMETER_BINDING_FAILED:
    'Parameter binding failed on ${engine}::${name}: ${reason}',
  QUERY_RESULT_PROCESSING_FAILED:
    'Failed to process query results on ${engine}::${name}: ${reason}',
  //#endregion Query Errors

  //#region Transaction Errors
  TRANSACTION_NOT_FOUND:
    'Transaction ${transactionId} not found on ${engine}::${name}',
  TRANSACTION_ALREADY_STARTED:
    'Transaction already started on ${engine}::${name}: current transaction ${transactionId}',
  TRANSACTION_NOT_ACTIVE:
    'No active transaction on ${engine}::${name} to ${operation}',
  TRANSACTION_TIMEOUT:
    'Transaction ${transactionId} timed out on ${engine}::${name} after ${timeout} seconds',
  TRANSACTION_DEADLOCK:
    'Transaction deadlock detected on ${engine}::${name}: ${transactionId}',
  TRANSACTION_ROLLBACK_FAILED:
    'Failed to rollback transaction ${transactionId} on ${engine}::${name}: ${reason}',
  TRANSACTION_COMMIT_FAILED:
    'Failed to commit transaction ${transactionId} on ${engine}::${name}: ${reason}',
  TRANSACTION_CLIENT_DEAD:
    'Transaction client for ${transactionId} is no longer available on ${engine}::${name}',
  TRANSACTION_SAVEPOINT_FAILED:
    'Savepoint operation failed on ${engine}::${name}: ${operation} ${savepoint} - ${reason}',
  TRANSACTION_ISOLATION_NOT_SUPPORTED:
    'Transaction isolation level ${isolationLevel} not supported on ${engine}::${name}',
  //#endregion Transaction Errors

  //#region Pool Management Errors
  POOL_INITIALIZATION_FAILED:
    'Failed to initialize connection pool for ${engine}::${name}: ${reason}',
  POOL_DESTRUCTION_FAILED:
    'Failed to destroy connection pool for ${engine}::${name}: ${reason}',
  POOL_CONNECTION_FAILED:
    'Failed to create pooled connection for ${engine}::${name}: ${reason}',
  POOL_CONNECTION_RELEASE_FAILED:
    'Failed to release connection to pool for ${engine}::${name}: ${reason}',
  POOL_VALIDATION_FAILED:
    'Pool connection validation failed for ${engine}::${name}: ${reason}',
  POOL_SIZE_LIMIT_EXCEEDED:
    'Pool size limit exceeded for ${engine}::${name}: requested ${requested}, max allowed ${maxConnections}',
  //#endregion Pool Management Errors

  //#region Engine Lifecycle Errors
  ENGINE_ALREADY_CONNECTED: 'Engine ${engine}::${name} is already connected',
  ENGINE_NOT_CONNECTED: 'Engine ${engine}::${name} is not connected',
  ENGINE_CLOSING: 'Engine ${engine}::${name} is currently closing',
  ENGINE_CLOSED:
    'Engine ${engine}::${name} is closed and cannot perform operation ${operation}',
  ENGINE_INITIALIZATION_FAILED:
    'Failed to initialize engine ${engine}::${name}: ${reason}',
  ENGINE_CLEANUP_FAILED:
    'Failed to cleanup engine ${engine}::${name}: ${reason}',
  //#endregion Engine Lifecycle Errors

  //#region Health Check Errors
  HEALTH_CHECK_FAILED: 'Health check failed for ${engine}::${name}: ${reason}',
  HEALTH_CHECK_TIMEOUT:
    'Health check timed out for ${engine}::${name} after ${timeout} seconds',
  ENGINE_UNHEALTHY:
    'Engine ${engine}::${name} is unhealthy: ${consecutiveErrors} consecutive errors',
  //#endregion Health Check Errors

  //#region Engine-Specific Errors
  SQL_CONSTRAINT_VIOLATION:
    'SQL constraint violation on ${engine}::${name}: ${constraint} - ${reason}',
  SQL_SYNTAX_ERROR: 'SQL syntax error on ${engine}::${name}: ${reason}',
  SQL_PERMISSION_DENIED:
    'Permission denied on ${engine}::${name}: ${operation} - ${reason}',
  MONGODB_OPERATION_FAILED:
    'MongoDB operation failed on ${engine}::${name}: ${operation} - ${reason}',
  MONGODB_COLLECTION_NOT_FOUND:
    'MongoDB collection ${collection} not found on ${engine}::${name}',
  SQLITE_LOCK_TIMEOUT:
    'SQLite database lock timeout on ${engine}::${name} after ${timeout} seconds',
  SQLITE_DISK_FULL: 'SQLite disk full error on ${engine}::${name}: ${reason}',
  SQLITE_CORRUPT_DATABASE:
    'SQLite database corruption detected on ${engine}::${name}: ${reason}',
  //#endregion Engine-Specific Errors

  //#region Resource Management Errors
  RESOURCE_LIMIT_EXCEEDED:
    'Resource limit exceeded on ${engine}::${name}: ${resource} - ${limit}',
  MEMORY_LIMIT_EXCEEDED:
    'Memory limit exceeded on ${engine}::${name}: ${usage}MB used, ${limit}MB limit',
  CONNECTION_LIMIT_EXCEEDED:
    'Connection limit exceeded on ${engine}::${name}: ${current}/${limit} connections',
  OPERATION_NOT_SUPPORTED:
    'Operation ${operation} not supported by ${engine}::${name}',
  //#endregion Resource Management Errors
} as const satisfies Record<string, string>;

export type DAMEngineErrorCode = keyof typeof DAMEngineErrorCodes;

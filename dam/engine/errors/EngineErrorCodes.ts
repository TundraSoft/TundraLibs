// Need to remove all these error codes and keep them simple
export const DAMEngineErrorCodes = {
  // Unknown error code was passed
  UNKNOWN_ERROR: 'Unknown error occurred in ${instanceId}: ${reason}',

  //#region Generic Engine Errors
  UNSUPPORTED_OPERATION: '${operation} is not supported in ${engine}',
  INVALID_CONFIG_VALUE: 'Configuration value for ${key} is invalid - ${reason}',
  MISSING_CONFIG_VALUE: 'Configuration key ${key} is missing',

  //#endregion Generic Engine Errors
  //#region Connection Errors
  // Generic (sent from abstract class) connection failure.
  CONNECTION_FAILED: 'Failed to connect to ${instanceId}',
  // Generic (sent from abstract class) disconnection failure.
  DISCONNECTION_FAILED: 'Failed to disconnect from ${instanceId}',
  // No connection but tried to query
  NO_CONNECTION: 'Could not acquire connection for ${instanceId}',
  //#endregion Connection Errors

  //#region Query Errors
  MISSING_PARAMETERS:
    'Following parameters ${missing} are required but not provided for query',
  TRANSACTION_NOT_FOUND:
    'Could not find active transaction with id ${transactionId}',
  DUPLICATE_TRANSACTION: 'Transaction with id ${transactionId} already exists',
  TRANSACTION_OPERATION_ERROR:
    'Failed to run transaction operation ${operation} on transaction ${transactionId}',
  QUERY_EXECUTION_FAILED: 'Failed to execute query',
  //#endregion Query Errors
} as const satisfies Record<string, string>;

export type DAMEngineErrorCode = keyof typeof DAMEngineErrorCodes;

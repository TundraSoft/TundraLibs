export const CacherEngineErrorCodes = {
  UNKNOWN_ERROR: 'Unknown error occurred',
  //#region Configuration Errors
  CONFIG_MALFORMED: 'Configuration is malformed',
  CONFIG_MISSING: 'Configuration key ${configKey} is missing',
  CONFIG_INVALID: 'Configuration value for ${configKey} is invalid: ${reason}',
  //#endregion Configuration Errors

  //#region Connection Errors
  CONNECTION_FAILED: 'Failed to connect to ${engine}: ${reason}',
  CONNECTION_TIMEOUT: 'Connection to ${engine} timed out after ${timeout}ms',
  CONNECTION_REFUSED: 'Connection to ${engine} was refused',
  CONNECTION_LOST: 'Connection to ${engine} was lost',
  CONNECTION_INVALID_CREDENTIALS: 'Invalid credentials for ${engine}',
  //#endregion Connection Errors

  //#region Operation Errors
  OPERATION_NOT_SUPPORTED:
    'Operation ${operation} is not supported in ${engine}',
  OPERATION_FAILED: 'Operation ${operation} failed: ${reason}',
  OPERATION_INVALID_PARAMS:
    'Invalid parameters for operation ${operation}: ${reason}',
  OPERATION_PERMISSION_DENIED: 'Permission denied for operation ${operation}',
  //#endregion Operation Errors
} as const satisfies Record<string, string>;

export type CacherEngineErrorCode = keyof typeof CacherEngineErrorCodes;

export enum ErrorCodes {
  "ConfigError" = "CONFIG_ERROR",
  "UnsupportedDialect" = "UNSUPPORTED_DIALECT",
  "ConnectionError" = "CONNECTION_ERROR",

  // Begin Model Errors
  "ModelConfigError" = "MODEL_CONFIG_ERROR",
}

export const ErrorMessages: Readonly<Record<ErrorCodes, string>> = {
  [ErrorCodes.ConfigError]: "The configuration provided is invalid.",
  [ErrorCodes.UnsupportedDialect]: "The dialect provided is not supported.",
  [ErrorCodes.ConnectionError]: "The connection to the database failed.",

  // Begin Model Errors
  [ErrorCodes.ModelConfigError]: "Database configuration not present.",
};

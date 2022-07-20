import type { Dialect } from "./types.ts";

export class NormError extends Error {
  protected _module = "norm";

  constructor(message: string, ...args: string[]) {
    // Replace args
    args.forEach((value, index) => {
      const val = String(value),
        rep = `\$\{${index}\}`;
      message = message.replaceAll(rep, val);
    });
    super(`[module=norm] ${message}`);
    Object.setPrototypeOf(this, NormError.prototype);
  }
}

export class ConnectionError extends NormError {
  protected _configName: string;
  protected _dialect: Dialect;
  protected _rawMessage: string;

  constructor(config: string, dialect: Dialect, msg: string) {
    super(
      `Error connecting to ${dialect} server using config ${config}: ${msg}`,
    );
    Object.setPrototypeOf(this, ConnectionError.prototype);

    this._configName = config;
    this._dialect = dialect;
    this._rawMessage = msg;
  }
}

export class GenericQueryError extends NormError {
  protected _configName: string;
  protected _dialect: Dialect;
  protected _rawMessage: string;

  constructor(config: string, dialect: Dialect, msg: string) {
    super(`Error executing query in ${dialect} using config ${config}: ${msg}`);
    Object.setPrototypeOf(this, ConnectionError.prototype);

    this._configName = config;
    this._dialect = dialect;
    this._rawMessage = msg;
  }
}

export class InvalidSchemaDefinition extends NormError {
  protected _modelName?: string;
  protected _missingConfig: string;
  protected _errorMessage: string;

  constructor(missingConfig: string, modelName?: string) {
    super(`Missing required configuration ${missingConfig}`);
    Object.setPrototypeOf(this, ConnectionError.prototype);

    this._modelName = modelName;
    this._missingConfig = missingConfig;
    this._errorMessage = `Missing required configuration ${missingConfig}`;
  }

  get modelName(): string | undefined {
    return this._modelName;
  }
}

export class PrimaryKeyUpdate extends NormError {
  protected _modelName?: string;
  protected _primaryKey: string;
  protected _errorMessage: string;

  constructor(primaryKey: string, modelName?: string) {
    super(`Updating primary key column: ${primaryKey} is not allowed`);
    Object.setPrototypeOf(this, ConnectionError.prototype);

    this._modelName = modelName;
    this._primaryKey = primaryKey;
    this._errorMessage =
      `Updating primary key column: ${primaryKey} is not allowed`;
  }

  get modelName(): string | undefined {
    return this._modelName;
  }
}

export class BulkUniqueKeyUpdate extends Error {
  protected _modelName?: string;
  protected _uniqueKey: string;
  protected _errorMessage: string;

  constructor(uniqueKey: string, modelName?: string) {
    super(`Bulk updating a unique key column: ${uniqueKey} is not allowed`);
    Object.setPrototypeOf(this, ConnectionError.prototype);

    this._modelName = modelName;
    this._uniqueKey = uniqueKey;
    this._errorMessage =
      `Bulk updating a unique key column: ${uniqueKey} is not allowed`;
  }

  get modelName(): string | undefined {
    return this._modelName;
  }
}

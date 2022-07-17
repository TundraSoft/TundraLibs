import type { Dialect } from "./types.ts";

export class ConnectionError extends Error {
  protected _configName: string;
  protected _dialect: Dialect;
  protected _errorMessage: string;

  constructor(config: string, dialect: Dialect, msg: string) {
    super(`Error connecting to ${dialect} server using config ${config}`);
    Object.setPrototypeOf(this, ConnectionError.prototype);

    this._configName = config;
    this._dialect = dialect;
    this._errorMessage = msg;
  }
}

export class GenericQueryError extends Error {
  protected _configName: string;
  protected _dialect: Dialect;
  protected _errorMessage: string;

  constructor(config: string, dialect: Dialect, msg: string) {
    super(`Error executing query in ${dialect} using config ${config}`);
    Object.setPrototypeOf(this, ConnectionError.prototype);

    this._configName = config;
    this._dialect = dialect;
    this._errorMessage = msg;
  }
}

export class InvalidModelConfiguration extends Error {
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

export class PrimaryKeyUpdate extends Error {
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

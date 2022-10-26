import { ModelValidation, QueryType } from "./types/mod.ts";

export class NormError extends Error {
  protected _module = "norm";
  protected _dialect: string;
  protected _config: string;

  constructor(message: string, config = "-", dialect = "-") {
    super(`[module='norm' config='${config}' dialect='${dialect}'] ${message}`);
    this._dialect = dialect;
    this._config = config;
    Object.setPrototypeOf(this, NormError.prototype);
  }

  get module(): string {
    return this._module;
  }

  get dialect(): string {
    return this._dialect;
  }

  get config(): string {
    return this._config;
  }
}

export class ConfigNotFound extends NormError {
  constructor(config: string) {
    super(`Could not find connection config with the name ${config}`, config);
    Object.setPrototypeOf(this, ConfigNotFound.prototype);
  }
}

export class ConnectionError extends NormError {
  constructor(message: string, config: string, dialect: string) {
    super(message, config, dialect);
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

export class QueryError extends NormError {
  constructor(
    query: string,
    type: QueryType,
    config: string,
    dialect: string,
  ) {
    super(`Error executing ${type} query: ${query}`, config, dialect);
    Object.setPrototypeOf(this, QueryError.prototype);
  }
}

export class ModelError extends Error {
  protected _module = "norm";
  protected _model: string;
  protected _dbConn: string;

  constructor(message: string, model = "-", dbConn = "-") {
    super(`[module='norm' model='${model}' conn='${dbConn}] ${message}`);
    this._model = model;
    this._dbConn = dbConn;
    Object.setPrototypeOf(this, ModelError.prototype);
  }

  get module(): string {
    return this._module;
  }

  get model(): string {
    return this._model;
  }

  get dbConn(): string {
    return this._dbConn;
  }
}

export class ConstraintColumnNotFound extends ModelError {
  protected _column: string;
  protected _type: string;
  constructor(column: string, type: string, model: string, dbConn: string) {
    super(
      `Column ${column} used to define constraint ${type} not found in model ${model}`,
      model,
      dbConn,
    );
    this._column = column;
    this._type = type;
  }
}

export class ModelPermission extends ModelError {
  constructor(permission: string, model: string, dbConn: string) {
    super(
      `Permission to perform ${permission} is not available`,
      model,
      dbConn,
    );
    Object.setPrototypeOf(this, ModelPermission.prototype);
  }
}

export class ModelNotNull extends ModelError {
  constructor(column: string, model: string, dbConn: string) {
    super(`Column ${column} is not nullable`, model, dbConn);
    Object.setPrototypeOf(this, ModelNotNull.prototype);
  }
}

export class ModelPrimaryKeyUpdate extends ModelError {
  constructor(column: string, model: string, dbConn: string) {
    super(`Primary key column ${column} cannot be updated`, model, dbConn);
    Object.setPrototypeOf(this, ModelPrimaryKeyUpdate.prototype);
  }
}

export class ModelUniqueKeyViolation extends ModelError {
  constructor(uniqueKey: string, model: string, dbConn: string) {
    super(`Unique Key ${uniqueKey} violation`, model, dbConn);
    Object.setPrototypeOf(this, ModelPrimaryKeyUpdate.prototype);
  }
}

// @TODO, have method to return all errors
export class ModelValidationError extends ModelError {
  protected errList: ModelValidation | { [key: number]: ModelValidation };
  constructor(
    message: ModelValidation | { [key: number]: ModelValidation },
    model: string,
    dbConn: string,
  ) {
    super(`Error validating data`, model, dbConn);
    this.errList = message;
    Object.setPrototypeOf(this, ModelValidationError.prototype);
  }

  get errorList(): ModelValidation | { [key: number]: ModelValidation } {
    return this.errList;
  }
}

export class ModelFilterError extends ModelError {
  constructor(
    message: string,
    model?: string,
    dbConn?: string,
  ) {
    super(`Malformed/Unknown filter: ${message}`, model, dbConn);
    Object.setPrototypeOf(this, ModelFilterError.prototype);
  }
}

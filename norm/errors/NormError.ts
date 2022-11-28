import type { ModelValidation } from "../types/mod.ts";
import type { Dialects, QueryOption, QueryType } from "../types/mod.ts";

export class NormError extends Error {
  protected static _module = "norm";
  protected _dialect: string;
  protected _connectionName: string;

  constructor(message: string, connectionName = "-", dialect = "-") {
    super(NormError._makeMessage(message, connectionName, dialect));
    this._dialect = dialect;
    this._connectionName = connectionName;
    Object.setPrototypeOf(this, NormError.prototype);
  }

  get dialect(): string {
    return this._dialect;
  }

  get connectionName(): string {
    return this._connectionName;
  }

  protected static _makeMessage(
    message: string,
    connectionName: string,
    dialect: string,
  ): string {
    return `[module='${NormError._module}' config='${connectionName}' dialect='${dialect}'] ${message}`;
  }
}

export class ConnectionNotFound extends NormError {
  constructor(connectionName: string) {
    super(
      `Could not find connection config with the name ${connectionName}`,
      connectionName,
    );
    Object.setPrototypeOf(this, ConnectionNotFound.prototype);
  }
}

export class DialectNotSupported extends NormError {
  constructor(connectionName: string, dialect: string) {
    super(`Unsupported dialect`, connectionName, dialect);
    Object.setPrototypeOf(this, DialectNotSupported.prototype);
  }
}

export class ConnectionError extends NormError {
  constructor(message: string, connectionName: string, dialect: Dialects) {
    super(message, connectionName, dialect);
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

export class CommunicationError extends ConnectionError {
  constructor(connectionName: string, dialect: Dialects) {
    super(
      `Connection was established, but could not communicate with database`,
      connectionName,
      dialect,
    );
    Object.setPrototypeOf(this, CommunicationError.prototype);
  }
}

export class QueryError extends NormError {
  protected _type: QueryType;
  protected _query: QueryOption;
  protected _sql?: string;

  constructor(
    message: string,
    query: QueryOption,
    connectionName: string,
    dialect: string,
  ) {
    super(message, connectionName, dialect);
    this._type = query.type;
    this._query = query;
    this.message =
      `[module='${NormError._module}' config='${connectionName}' dialect='${dialect}' ${
        JSON.stringify(this.query)
      }] ${message}`;
    Object.setPrototypeOf(this, QueryError.prototype);
  }

  get type(): QueryType {
    return this._type;
  }

  get query(): QueryOption {
    return this._query;
  }
}

export class ModelError extends NormError {
  protected _model: string;

  constructor(
    message: string,
    model: string,
    connectionName = "-",
    dialect = "-",
  ) {
    super(message, connectionName, dialect);
    this._model = model;
    this.message =
      `[module='${NormError._module}' config='${connectionName}' dialect='${dialect}' model='${model}'] ${message}`;
    Object.setPrototypeOf(this, ModelError.prototype);
  }

  get model(): string {
    return this._model;
  }
}

export class ModelConfigError extends ModelError {
  constructor(message: string, model: string, connectionName?: string) {
    super(message, model, connectionName);
    Object.setPrototypeOf(this, ModelConfigError.prototype);
  }
}

export class ModelColumnNotDefined extends ModelError {
  protected _column: string;
  constructor(column: string, model: string, connectionName?: string) {
    super(
      `Column ${column} is not defined in model ${model}`,
      model,
      connectionName,
    );
    this._column = column;
    Object.setPrototypeOf(this, ModelColumnNotDefined.prototype);
  }

  get column(): string {
    return this._column;
  }
}

export class ModelPermissionError extends ModelError {
  protected _permission: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE";
  constructor(
    permission: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE",
    model: string,
    connectionName: string,
  ) {
    super(
      `Permission ${permission} not granted for model ${model}`,
      model,
      connectionName,
    );
    this._permission = permission;
    Object.setPrototypeOf(this, ModelPermissionError.prototype);
  }

  get permission(): "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE" {
    return this._permission;
  }
}

export class ModelValidationError extends ModelError {
  protected errList: ModelValidation | { [key: number]: ModelValidation };
  constructor(
    message: ModelValidation | { [key: number]: ModelValidation },
    model: string,
    connectionName: string,
  ) {
    super(`Error validating data`, model, connectionName);
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
    model: string,
    connectionName: string,
  ) {
    super(`Malformed/Unknown filter: ${message}`, model, connectionName);
    Object.setPrototypeOf(this, ModelFilterError.prototype);
  }
}

export class ModelFilterSecureColumn extends ModelError {
  protected _column: string;
  constructor(column: string, model: string, connectionName: string) {
    super(
      `Columns ${column} is an Encrypted/Hashed column and cannot be used in a filter`,
      model,
      connectionName,
    );
    this._column = column;
    Object.setPrototypeOf(this, ModelFilterSecureColumn.prototype);
  }
}

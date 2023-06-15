export class NormError extends Error {
  protected static _module = 'norm';
  protected _dialect: string;
  protected _connectionName: string;

  constructor(message: string, connectionName = '-', dialect = '-') {
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
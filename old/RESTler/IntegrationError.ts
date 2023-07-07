export class IntegrationError extends Error {
  protected _module: string;
  protected _internal = true;
  protected _endpoint?: string;

  constructor(module: string, message: string, endpoint?: string) {
    const msg = `[integration-module='${module}' ` +
      (endpoint ? `endpoint='${endpoint}'` : '') + `] ${message}`;
    super(msg);
    this._module = module;
    this._endpoint = endpoint;
    Object.setPrototypeOf(this, IntegrationError.prototype);
  }

  get isInternal(): boolean {
    return this._internal;
  }

  get module(): string {
    return this._module;
  }

  get endpoint(): string | undefined {
    return this._endpoint;
  }
}

export class IntegrationConfigError extends Error {
  protected _module: string;
  protected _internal = true;

  constructor(module: string, message: string) {
    const msg =
      `[integration-module='${module}'] Error in integration config ${message}`;
    super(msg);
    this._module = module;
    Object.setPrototypeOf(this, IntegrationConfigError.prototype);
  }

  get isInternal(): boolean {
    return this._internal;
  }

  get module(): string {
    return this._module;
  }
}

export class IntegrationTimeout extends IntegrationError {
  protected _internal = false;

  constructor(module: string, timeout: number, endpoint?: string) {
    const message = `Timeout of ${timeout}ms exceeded`;
    super(module, message, endpoint);
    Object.setPrototypeOf(this, IntegrationTimeout.prototype);
  }
}

export class IntegrationResponseError extends IntegrationError {
  protected _internal = true;

  constructor(module: string, message: string, endpoint?: string) {
    super(module, message, endpoint);
    Object.setPrototypeOf(this, IntegrationResponseError.prototype);
  }
}

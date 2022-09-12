export class BaseEndpointError extends Error {
  protected _module = 'Endpoint';

  constructor(message: string) {
    message = `[module='Endpoint'] ${message}`;
    super(message);
    Object.setPrototypeOf(this, BaseEndpointError.prototype);
  }
}

export class MissingNameError extends BaseEndpointError {
  constructor() {
    super('Route name must be provided');
    Object.setPrototypeOf(this, MissingNameError.prototype);
  }
}

export class DuplicateNameError extends BaseEndpointError {
  protected _name: string
  
  constructor(name: string) {
    super(`There is already an endpoint with the name: ${name}`);
    this._name = name;
    Object.setPrototypeOf(this, DuplicateNameError.prototype);
  }
}

export class DuplicateRouteError extends BaseEndpointError {
  protected _route: string
  
  constructor(route: string) {
    super(`There is already an endpoint with the route: ${route}`);
    this._route = route;
    Object.setPrototypeOf(this, DuplicateRouteError.prototype);
  }
}

export class MissingRoutePathError extends BaseEndpointError {
  protected _name: string;
  constructor(name: string) {
    super(`Route must be provided for endpoint: ${name}`);
    this._name = name;
    Object.setPrototypeOf(this, MissingRoutePathError.prototype);
  }
}

export class UnsupportedContentTypeError extends BaseEndpointError {
  protected _contentType: string;
  protected _name: string;
  constructor(name: string, contentType: string) {
    super(`Unsupported content type: ${contentType} in endpoint: ${name}`);
    this._contentType = contentType;
    this._name = name;
    Object.setPrototypeOf(this, UnsupportedContentTypeError.prototype);
  }
}


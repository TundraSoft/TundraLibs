import { RESTlerBaseError } from './BaseError.error.ts';

export class RESTlerConfigError extends RESTlerBaseError {
  protected _internal = false;

  constructor(errorMessage: string) {
    const message = `Configuration Error - ${errorMessage}`;
    super(message);
    Object.setPrototypeOf(this, RESTlerConfigError.prototype);
  }
}

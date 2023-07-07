import { RESTlerBaseError } from './BaseError.error.ts';

export class RESTlerTimeoutError extends RESTlerBaseError {
  protected _internal = false;

  constructor(endpoint: string, timeout: number) {
    const message = `Timeout of ${timeout}ms exceeded`;
    super(message, endpoint);
    Object.setPrototypeOf(this, RESTlerTimeoutError.prototype);
  }
}

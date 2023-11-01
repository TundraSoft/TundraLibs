import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerTimeoutError extends RESTlerBaseError {
  name = 'RESTlerTimeoutError';
  constructor(name: string, timeout: number, metaTags: RESTlerEndpoint) {
    super(
      name,
      `Request aborted after ${timeout}s as response was not received.`,
      metaTags,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerTimeoutError extends RESTlerBaseError {
  name = 'RESTlerTimeoutError';
  constructor(name: string, timeout: number, metaTags: RESTlerErrorMeta) {
    super(
      name,
      `Request aborted after ${timeout}s as response was not received.`,
      metaTags,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

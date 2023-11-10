import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerUnhandledError extends RESTlerBaseError {
  name = 'RESTlerUnhandledError';
  constructor(name: string, message: string, metaTags: RESTlerErrorMeta) {
    super(name, `Unhandled error - ${message}.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

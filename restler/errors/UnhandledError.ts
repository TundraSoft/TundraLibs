import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerUnhandledError extends RESTlerBaseError {
  name = 'RESTlerUnhandledError';
  constructor(name: string, message: string, metaTags: RESTlerEndpoint) {
    super(name, `Unhandled error - ${message}.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

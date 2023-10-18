import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerUnknownError extends RESTlerBaseError {
  constructor(name: string, message: string, metaTags: RESTlerEndpoint) {
    super(name, `Unhandled error - ${message}.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

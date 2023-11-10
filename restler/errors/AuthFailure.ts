import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerAuthFailure extends RESTlerBaseError {
  name = 'RESTlerAuthFailure';
  constructor(name: string, metaTags: RESTlerErrorMeta) {
    super(name, `Received authentication error.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerAuthFailure extends RESTlerBaseError {
  constructor(name: string, metaTags: RESTlerEndpoint) {
    super(name, `Received authentication error.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

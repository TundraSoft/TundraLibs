import { RESTlerBaseError } from './BaseError.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerAuthFailure extends RESTlerBaseError {
  name = 'RESTlerAuthFailure';
  constructor(name: string, meta: Record<string, unknown>) {
    super(name, `Received authentication error.`, meta);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

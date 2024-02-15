import { RESTlerBaseError } from './Base.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerTimeoutError extends RESTlerBaseError {
  constructor(
    timeout: number,
    metaTags: RESTlerEndpoint & Record<string, unknown>,
  ) {
    super(
      `Request aborted after ${timeout}s as response was not received.`,
      metaTags,
    );
  }
}

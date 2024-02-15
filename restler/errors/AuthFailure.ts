import { RESTlerBaseError } from './Base.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerAuthFailure extends RESTlerBaseError {
  constructor(
    metaTags: RESTlerEndpoint & Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      `Received authentication error.`,
      metaTags,
      cause,
    );
  }
}

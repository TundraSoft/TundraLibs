import { RESTlerBaseError } from './Base.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerUnhandledError extends RESTlerBaseError {
  constructor(
    message: string,
    metaTags: RESTlerEndpoint & Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      message,
      metaTags,
      cause,
    );
  }
}

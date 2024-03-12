import { RESTlerEndpointError, type RESTlerErrorMeta } from './Endpoint.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerUnhandledError extends RESTlerEndpointError {
  constructor(
    message: string,
    metaTags: RESTlerErrorMeta,
    cause?: Error,
  ) {
    super(
      message,
      metaTags,
      cause,
    );
  }
}

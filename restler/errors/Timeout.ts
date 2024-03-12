import { RESTlerEndpointError, type RESTlerErrorMeta } from './Endpoint.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerTimeoutError extends RESTlerEndpointError {
  constructor(
    timeout: number,
    metaTags: RESTlerErrorMeta,
  ) {
    super(
      `Request aborted after ${timeout}s as response was not received.`,
      metaTags,
    );
  }
}

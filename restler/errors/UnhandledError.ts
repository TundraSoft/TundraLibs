import { RESTlerEndpointError, type RESTlerErrorMeta } from './Endpoint.ts';

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

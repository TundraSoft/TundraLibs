import { RESTlerEndpointError, type RESTlerErrorMeta } from './Endpoint.ts';

export class RESTlerAuthFailure extends RESTlerEndpointError {
  constructor(
    metaTags: RESTlerErrorMeta,
    cause?: Error,
  ) {
    super(
      `Authentication failed`,
      metaTags,
      cause,
    );
  }
}

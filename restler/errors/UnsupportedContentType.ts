import { RESTlerEndpointError, type RESTlerErrorMeta } from './Endpoint.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerUnsupportedContentType extends RESTlerEndpointError {
  constructor(
    type: string,
    metaTags: RESTlerErrorMeta,
  ) {
    super(
      `Unsupported content type ${type}. Only JSON, TEXT is supported.`,
      metaTags,
    );
  }
}

import { RESTlerBaseError } from './Base.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerUnsupportedContentType extends RESTlerBaseError {
  constructor(
    type: string,
    metaTags: RESTlerEndpoint & Record<string, unknown>,
  ) {
    super(
      `Unsupported content type ${type}. Only JSON, TEXT is supported.`,
      metaTags,
    );
  }
}

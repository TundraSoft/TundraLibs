import { RESTlerBaseError } from './BaseError.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerUnsupportedContentType extends RESTlerBaseError {
  name = 'RESTlerUnsupportedContentType';
  constructor(name: string, type: string, metaTags: RESTlerEndpoint) {
    super(
      name,
      `Unsupported content type ${type}. Only JSON, TEXT is supported.`,
      metaTags,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

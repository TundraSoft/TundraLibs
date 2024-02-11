import { RESTlerBaseError } from './BaseError.ts';
// import type { RESTlerErrorMeta } from './BaseError.ts';

export class RESTlerUnsupportedContentType extends RESTlerBaseError {
  name = 'RESTlerUnsupportedContentType';
  constructor(name: string, type: string, metaTags: Record<string, unknown>) {
    super(
      name,
      `Unsupported content type ${type}. Only JSON, TEXT is supported.`,
      metaTags,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

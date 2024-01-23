import { NormBaseError } from './Base.ts';
import type { NormBaseErrorMetaTags } from './Base.ts';

export class NormClientError extends NormBaseError {
  public name = 'NormClientError';

  constructor(
    message: string,
    metaTags: NormBaseErrorMetaTags & { code?: string },
  ) {
    metaTags.code = metaTags.code ?? 'N/A';
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

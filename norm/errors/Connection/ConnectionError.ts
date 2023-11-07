import { NormBaseError } from '../BaseError.ts';
import type { NormErrorMetaTags } from '../BaseError.ts';

export class NormConnectionError extends NormBaseError {
  public name = 'NormConnectionError';

  constructor(message: string, metaTags: NormErrorMetaTags) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

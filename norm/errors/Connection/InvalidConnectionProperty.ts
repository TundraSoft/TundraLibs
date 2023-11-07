import { NormBaseError } from '../BaseError.ts';
import type { NormErrorMetaTags } from '../BaseError.ts';

export class NormInvalidConnectionPropertyError extends NormBaseError {
  public name = 'NormInvalidConnectionPropertyError';

  constructor(message: string, metaTags: NormErrorMetaTags) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

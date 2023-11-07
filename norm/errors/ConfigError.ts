import { NormBaseError } from './BaseError.ts';
import type { NormErrorMetaTags } from './BaseError.ts';

export class NormConfigError extends NormBaseError {
  public name = 'NormConfigError';

  constructor(message: string, metaTags: NormErrorMetaTags) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

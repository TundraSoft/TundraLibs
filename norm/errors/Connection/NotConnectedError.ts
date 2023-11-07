import { NormBaseError } from '../BaseError.ts';
import type { NormErrorMetaTags } from '../BaseError.ts';

export class NormNotConnectedError extends NormBaseError {
  public name = 'NormNotConnectedError';

  constructor(metaTags: NormErrorMetaTags) {
    super('Connection to the database could not be established', metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

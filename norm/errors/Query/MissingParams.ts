import { NormQueryError } from './QueryError.ts';
import type { NormQueryMetaTags } from './QueryError.ts';

export class NormQueryMissingParamsError extends NormQueryError {
  public name = 'NormQueryMissingParamsError';

  constructor(metaTags: NormQueryMetaTags) {
    super(`Parameters defined in query but missing in argument`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

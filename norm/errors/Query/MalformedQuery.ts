import { NormQueryError } from './QueryError.ts';
import type { NormQueryMetaTags } from './QueryError.ts';

export class NormMalformedQueryError extends NormQueryError {
  public name = 'NormMalformedQueryError';

  constructor(message: string, metaTags: NormQueryMetaTags & { sql: string }) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

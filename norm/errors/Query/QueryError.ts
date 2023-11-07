import { NormBaseError } from '../BaseError.ts';
import type { NormErrorMetaTags } from '../BaseError.ts';

export type NormQueryMetaTags = NormErrorMetaTags & { sql: string };

export class NormQueryError extends NormBaseError {
  public name = 'NormQueryError';

  constructor(message: string, metaTags: NormQueryMetaTags) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get sql(): string {
    return this._metaTags.sql as string;
  }
}

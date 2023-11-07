import { TundraLibError } from '../../utils/mod.ts';
import type { ErrorMetaTags, TundraLibErrorMetaTags } from '../../utils/mod.ts';
import type { Dialects } from '../types/mod.ts';

export type NormErrorMetaTags = {
  dialect?: Dialects | 'N/A';
  connection?: string;
} & ErrorMetaTags;

export class NormBaseError extends TundraLibError {
  public name = 'NormBaseError';
  declare protected _metaTags: NormErrorMetaTags & { library: string };

  constructor(message: string, metaTags: NormErrorMetaTags) {
    // Inject Library name
    metaTags.library = 'NORM';
    super(message, metaTags as TundraLibErrorMetaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get dialect(): string {
    return this._metaTags.dialect || 'N/A';
  }

  get connection(): string {
    return this._metaTags.connection || 'N/A';
  }
}

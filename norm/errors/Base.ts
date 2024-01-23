import { TundraLibError } from '../../utils/mod.ts';
import type { TundraLibErrorMetaTags } from '../../utils/mod.ts';
import type { Dialects } from '../types/mod.ts';

export type NormBaseErrorMetaTags = {
  dialect?: Dialects;
  config: string;
} & Record<string, unknown>;

export class NormBaseError extends TundraLibError {
  name = 'NormBaseError';
  declare protected _metaTags: NormBaseErrorMetaTags & TundraLibErrorMetaTags;

  constructor(message: string, metaTags: NormBaseErrorMetaTags) {
    metaTags = Object.assign({ library: 'norm' }, metaTags);
    super(message, metaTags as TundraLibErrorMetaTags & NormBaseErrorMetaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get dialect(): Dialects | 'N/A' {
    return this._metaTags.dialect || 'N/A';
  }

  get config(): string {
    return this._metaTags.config;
  }
}

import {
  TundraLibError,
  type TundraLibErrorMetaTags,
} from '../../utils/mod.ts';

import type { Dialects } from '../types/mod.ts';

export type DAMBaseErrorMetaTags = {
  dialect?: Dialects;
  config: string;
} & Record<string, unknown>;

export class DAMBaseError extends TundraLibError {
  name = 'DAMBaseError';
  declare protected _metaTags: DAMBaseErrorMetaTags & TundraLibErrorMetaTags;

  constructor(message: string, metaTags: DAMBaseErrorMetaTags) {
    metaTags = Object.assign({ library: 'norm' }, metaTags);
    super(message, metaTags as TundraLibErrorMetaTags & DAMBaseErrorMetaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get dialect(): Dialects | 'N/A' {
    return this._metaTags.dialect || 'N/A';
  }

  get config(): string {
    return this._metaTags.config;
  }
}

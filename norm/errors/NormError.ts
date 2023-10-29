import { BaseError } from '../../utils/BaseError.ts';
import type { ErrorMetaTags } from '../../utils/BaseError.ts';
import type { Dialects, NormMetaTags } from '../types/mod.ts';

export class NormError extends BaseError {
  constructor(message: string, metaTags: NormMetaTags) {
    const mt: ErrorMetaTags = metaTags;
    super(`${message}`, 'norm', mt);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get dialect(): Dialects {
    return this._metaTags?.dialect as Dialects;
  }

  get configName(): string {
    return this._metaTags?.config as string;
  }
}

import { BaseError } from '../../utils/BaseError.ts';
import type { ErrorMetaTags } from '../../utils/BaseError.ts';

export class NormBaseError extends BaseError {
  constructor(message: string, metaTags?: ErrorMetaTags) {
    super(message, 'norm', metaTags);
    Object.setPrototypeOf(this, NormBaseError.prototype);
  }

  get dialect(): string {
    return this._metaTags?.dialect as string;
  }

  get name(): string {
    return this._metaTags?.name as string;
  }
}

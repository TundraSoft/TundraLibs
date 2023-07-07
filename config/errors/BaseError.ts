import { BaseError } from '../../common/BaseError.ts';
import type { ErrorMetaTags } from '../../common/BaseError.ts';

export class ConfigBaseError extends BaseError {
  constructor(message: string, metaTags?: ErrorMetaTags) {
    super(message, 'config', metaTags);
    Object.setPrototypeOf(this, ConfigBaseError.prototype);
  }

  get config(): string {
    return this._metaTags?.config as string;
  }
}

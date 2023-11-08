import { TundraLibError } from '../../utils/mod.ts';
import type { ErrorMetaTags, TundraLibErrorMetaTags } from '../../utils/mod.ts';

export class ConfigBaseError extends TundraLibError {
  public name = 'ConfigBaseError';
  protected _config: string;

  constructor(config: string, message: string, metaTags?: ErrorMetaTags) {
    if (metaTags === undefined) {
      metaTags = {};
    }
    metaTags.library = 'Config';
    metaTags.config = config;
    super(message, metaTags as TundraLibErrorMetaTags);
    this._config = config;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get config(): string {
    return this._config;
  }
}

import { ConfigBaseError } from './BaseError.ts';
import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigNotFound extends ConfigBaseError {
  name = 'ConfigNotFound';
  constructor(name: string, metaTags?: ErrorMetaTags) {
    super(name, `Could not find configuration key.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

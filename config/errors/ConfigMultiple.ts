import { ConfigBaseError } from './BaseError.ts';
import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigMultiple extends ConfigBaseError {
  name = 'ConfigMultiple';
  constructor(name: string, metaTags?: ErrorMetaTags) {
    super(name, `Found multiple config files with the same name.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

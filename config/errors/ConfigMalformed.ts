import { ConfigBaseError } from './BaseError.ts';
import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigMalformed extends ConfigBaseError {
  name = 'ConfigMalformed';
  constructor(name: string, metaTags?: ErrorMetaTags) {
    super(
      name,
      `Could not find configuration file in the path specified.`,
      metaTags,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

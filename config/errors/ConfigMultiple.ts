import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigMultiple extends ConfigBaseError {
  name = 'ConfigMultiple';
  constructor(name: string, meta?: Record<string, unknown>) {
    super(name, `Found multiple config files with the same name.`, meta);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

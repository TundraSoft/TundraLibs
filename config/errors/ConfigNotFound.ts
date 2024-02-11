import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigNotFound extends ConfigBaseError {
  name = 'ConfigNotFound';
  constructor(name: string, meta?: Record<string, unknown>) {
    super(name, `Could not find configuration key.`, meta);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

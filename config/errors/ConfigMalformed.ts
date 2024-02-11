import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigMalformed extends ConfigBaseError {
  name = 'ConfigMalformed';
  constructor(name: string, meta?: Record<string, unknown>) {
    super(
      name,
      `Could not find configuration file in the path specified.`,
      meta,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

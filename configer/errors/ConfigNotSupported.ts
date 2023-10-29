import { ConfigBaseError } from './BaseError.ts';

export class ConfigNotSupported extends ConfigBaseError {
  constructor(metaTags: { config: string; path: string; ext: string }) {
    super(`Unsupported config file extention`, metaTags);
    Object.setPrototypeOf(this, ConfigNotSupported.prototype);
  }
}

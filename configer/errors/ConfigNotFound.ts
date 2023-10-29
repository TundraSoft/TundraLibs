import { ConfigBaseError } from './BaseError.ts';

export class ConfigNotFound extends ConfigBaseError {
  constructor(metaTags: { config: string; path: string }) {
    super(`Config file not found in the specified path`, metaTags);
    Object.setPrototypeOf(this, ConfigNotFound.prototype);
  }

  get config(): string {
    return this._metaTags?.config as string;
  }
}

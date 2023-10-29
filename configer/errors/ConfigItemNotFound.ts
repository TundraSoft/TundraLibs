import { ConfigBaseError } from './BaseError.ts';

export class ConfigItemNotFound extends ConfigBaseError {
  constructor(name: string[], metaTags: { config: string }) {
    let message = `Could not find configuration item: ${name.join('/')}`;
    if (name.length === 0) {
      message = `Could not find configuration set ${metaTags.config}`;
    }
    super(message, metaTags);
    Object.setPrototypeOf(this, ConfigItemNotFound.prototype);
  }
}

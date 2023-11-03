import { ConfigBaseError } from './BaseError.ts';
import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigUnsupported extends ConfigBaseError {
  name = 'ConfigUnsupported';
  constructor(name: string, metaTags?: ErrorMetaTags) {
    super(name, `Only YAML/YML, TOML and JSON files are supported.`, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

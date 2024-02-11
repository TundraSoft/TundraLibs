import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigUnsupported extends ConfigBaseError {
  name = 'ConfigUnsupported';
  constructor(name: string, meta?: Record<string, unknown>) {
    super(name, `Only YAML/YML, TOML and JSON files are supported.`, meta);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

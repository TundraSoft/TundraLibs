import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigMalformed extends ConfigBaseError {
  constructor(config: string, meta: Record<string, unknown>, cause?: Error) {
    super(config, 'Error parsing config file ${path}/${file}', meta, cause);
  }
}

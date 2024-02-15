import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigNotFound extends ConfigBaseError {
  constructor(config: string, meta: Record<string, unknown>) {
    super(config, 'Could not find config item (${item})', meta);
  }
}

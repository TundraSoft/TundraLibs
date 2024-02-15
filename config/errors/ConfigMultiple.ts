import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigMultiple extends ConfigBaseError {
  constructor(config: string, meta: Record<string, unknown>) {
    super(
      config,
      'Found multiple config files with the same name in ${path}: ${file}',
      meta,
    );
  }
}

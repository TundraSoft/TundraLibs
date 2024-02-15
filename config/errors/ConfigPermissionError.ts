import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigPermissionError extends ConfigBaseError {
  constructor(config: string, meta: Record<string, unknown>) {
    super(config, 'Read permission is required for ${path}', meta);
  }
}

import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigPermissionError extends ConfigBaseError {
  name = 'ConfigPermissionError';
  constructor(name: string, meta: Record<string, unknown>) {
    super(
      name || 'N/A',
      `Read permission is required to read configuration file.`,
      meta,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

import { ConfigBaseError } from './BaseError.ts';

export class ConfigReadError extends ConfigBaseError {
  constructor(meta: { config: string; path: string }) {
    super(`Read permission required to load configuration file`, meta);
    Object.setPrototypeOf(this, ConfigReadError.prototype);
  }
}

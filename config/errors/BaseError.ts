import {
  TundraLibError,
  type TundraLibErrorMetaTags,
} from '../../utils/mod.ts';

export class ConfigBaseError extends TundraLibError {
  public name = 'ConfigBaseError';
  protected _config: string;

  constructor(config: string, message: string, meta?: Record<string, unknown>) {
    if (meta === undefined) {
      meta = {};
    }
    meta.library = 'Config';
    meta.config = config;
    super(message, meta as TundraLibErrorMetaTags);
    this._config = config;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get config(): string {
    return this._config;
  }
}

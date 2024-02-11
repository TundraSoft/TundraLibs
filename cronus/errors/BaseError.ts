import { TundraLibError } from '../../utils/mod.ts';
import type { TundraLibErrorMetaTags } from '../../utils/mod.ts';

export class CronusBaseError extends TundraLibError {
  public name = 'CronusBaseError';

  constructor(message: string, meta?: Record<string, unknown>) {
    if (meta === undefined) {
      meta = {};
    }
    meta.library = 'Cronus';
    super(message, meta as TundraLibErrorMetaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get job(): string | undefined {
    if (this._meta) {
      if (this._meta.job) {
        return this._meta.job as string;
      }
    }
    return undefined;
  }

  get schedule(): string | undefined {
    if (this._meta) {
      if (this._meta.schedule) {
        return this._meta.schedule as string;
      }
    }
    return undefined;
  }
}

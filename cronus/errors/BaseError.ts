import { TundraLibError } from '../../utils/mod.ts';
import type { ErrorMetaTags, TundraLibErrorMetaTags } from '../../utils/mod.ts';

export class CronusBaseError extends TundraLibError {
  public name = 'CronusBaseError';

  constructor(message: string, metaTags?: ErrorMetaTags) {
    if (metaTags === undefined) {
      metaTags = {};
    }
    metaTags.library = 'Cronus';
    super(message, metaTags as TundraLibErrorMetaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get job(): string | undefined {
    if (this._metaTags) {
      if (this._metaTags.job) {
        return this._metaTags.job as string;
      }
    }
    return undefined;
  }

  get schedule(): string | undefined {
    if (this._metaTags) {
      if (this._metaTags.schedule) {
        return this._metaTags.schedule as string;
      }
    }
    return undefined;
  }
}

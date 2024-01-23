import { NormBaseError } from './Base.ts';
import type { NormBaseErrorMetaTags } from './Base.ts';

export class NormConfigError extends NormBaseError {
  public name = 'NormConfigError';

  constructor(
    message: string,
    metaTags: NormBaseErrorMetaTags & { configItem: string },
  ) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

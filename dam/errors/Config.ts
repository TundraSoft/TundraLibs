import { DAMBaseError } from './Base.ts';
import type { DAMBaseErrorMetaTags } from './Base.ts';

export class DAMConfigError extends DAMBaseError {
  public name = 'NDAMonfigError';

  constructor(
    message: string,
    metaTags: DAMBaseErrorMetaTags & { configItem: string },
  ) {
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

import { DAMBaseError } from './Base.ts';
import type { DAMBaseErrorMetaTags } from './Base.ts';

export class DAMClientError extends DAMBaseError {
  public name = 'DAMClientError';

  constructor(
    message: string,
    metaTags: DAMBaseErrorMetaTags & { code?: string },
  ) {
    metaTags.code = metaTags.code ?? 'N/A';
    super(message, metaTags);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

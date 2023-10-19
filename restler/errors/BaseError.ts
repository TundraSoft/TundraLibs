import { HTTPMethods, path } from '../../dependencies.ts';
import { BaseError } from '../../utils/BaseError.ts';
import type { ErrorMetaTags } from '../../utils/BaseError.ts';

import type { RESTlerEndpoint } from '../types/mod.ts';

export class RESTlerBaseError extends BaseError {
  protected _name: string;

  constructor(name: string, message: string, metaTags: RESTlerEndpoint) {
    const mt: ErrorMetaTags = metaTags;
    if (mt.searchParams) {
      const sp = new URLSearchParams(metaTags.searchParams);
      mt.path = `${metaTags.path}?${sp.toString()}`;
      delete mt.searchParams;
    }
    mt.vendor = name;
    super(`${name} - ${message}`, 'RESTler', mt);
    this._name = name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get method(): HTTPMethods {
    return this._metaTags?.method as HTTPMethods;
  }

  get url(): string {
    return path.join(
      this._metaTags?.baseURL as string,
      this._metaTags?.version as string || '',
      this._metaTags?.path as string,
    );
  }

  get version(): string {
    return this._metaTags?.version as string;
  }

  get vendor(): string {
    return this._name;
  }
}

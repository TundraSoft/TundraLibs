import { HTTPMethods, path } from '../../dependencies.ts';
import { TundraLibError } from '../../utils/mod.ts';
import type { TundraLibErrorMetaTags } from '../../utils/mod.ts';

import type { RESTlerEndpoint } from '../types/mod.ts';

export type RESTlerErrorMeta = Partial<RESTlerEndpoint> & {
  [key: string]: unknown;
};

export class RESTlerBaseError extends TundraLibError {
  protected _vendor: string;
  public name = 'RESTlerBaseError';
  constructor(vendor: string, message: string, metaTags: RESTlerErrorMeta) {
    const mt: TundraLibErrorMetaTags = {
      ...{ library: 'RESTler' },
      ...metaTags,
    };
    if (mt.searchParams) {
      const sp = new URLSearchParams(metaTags.searchParams);
      mt.path = `${metaTags.path}?${sp.toString()}`;
      delete mt.searchParams;
    }
    mt.vendor = vendor;
    super(message, mt);
    this._vendor = vendor;
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
    return this._vendor;
  }
}

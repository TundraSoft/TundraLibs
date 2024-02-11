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
  constructor(vendor: string, message: string, meta: Record<string, unknown>) {
    const mt: TundraLibErrorMetaTags = {
      ...{ library: 'RESTler' },
      ...meta,
    };
    // if (mt.searchParams) {
    //   const sp = new URLSearchParams(mt.searchParams);
    //   mt.path = `${meta.path}?${sp.toString()}`;
    //   delete mt.searchParams;
    // }
    mt.vendor = vendor;
    super(message, mt);
    this._vendor = vendor;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get method(): HTTPMethods {
    return this._meta?.method as HTTPMethods;
  }

  get url(): string {
    return path.join(
      this._meta?.baseURL as string,
      this._meta?.version as string || '',
      this._meta?.path as string,
    );
  }

  get version(): string {
    return this._meta?.version as string;
  }

  get vendor(): string {
    return this._vendor;
  }
}

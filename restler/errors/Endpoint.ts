import { HTTPMethods, path } from '../../dependencies.ts';
import { RESTlerBaseError } from './Base.ts';
import type { RESTlerEndpoint } from '../types/mod.ts';

export type RESTlerErrorMeta = RESTlerEndpoint & Record<string, unknown>;

export class RESTlerEndpointError extends RESTlerBaseError {
  public readonly library = 'RESTler';
  declare public readonly vendor: string;

  constructor(
    message: string,
    meta: RESTlerErrorMeta,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get method(): HTTPMethods {
    return this.meta.method as HTTPMethods;
  }

  get url(): string {
    return path.join(
      this.meta.baseURL as string,
      this.meta.version as string || '',
      this.meta.path as string,
    );
  }

  get version(): string {
    return this.meta.version as string;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.vendor} ${this.name}] ${this.message}`;
  }
}

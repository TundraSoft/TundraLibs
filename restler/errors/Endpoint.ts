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
}

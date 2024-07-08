import { path } from '../../dependencies.ts';
import type { HTTPMethods } from '../../utils/mod.ts';
import { TundraLibError } from '../../utils/TundraLibError.ts';

export class RESTlerBaseError extends TundraLibError {
  public readonly library = 'RESTler';
  declare public readonly vendor: string;

  constructor(
    message: string,
    meta: Record<string, unknown>,
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

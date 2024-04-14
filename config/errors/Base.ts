import { TundraLibError } from '../../utils/TundraLibError.ts';

export class ConfigError extends TundraLibError {
  public readonly library = 'Config';

  constructor(
    message: string,
    meta: { config: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get config(): string {
    return this.meta.config as string;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.name} ${this.config}] ${this.message}`;
  }
}

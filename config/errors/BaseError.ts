import { TundraLibError } from '../../utils/TundraLibError.ts';

export class ConfigBaseError extends TundraLibError {
  public readonly library = 'Config';
  public readonly config: string;

  constructor(
    config: string,
    message: string,
    meta?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
    this.config = config;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.name} ${this.config}] ${this.message}`;
  }
}

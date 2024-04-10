import { BaseError } from './BaseError.ts';

export class TundraLibError extends BaseError {
  declare public readonly library: string;

  constructor(
    message: string,
    meta: Record<string, unknown> = {},
    cause?: Error | undefined,
  ) {
    super(message, meta, cause);
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}: ${this.name}] ${this.message}`;
  }
}

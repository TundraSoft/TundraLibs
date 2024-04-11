import { TundraLibError } from '../../utils/TundraLibError.ts';

export class NORMError extends TundraLibError {
  public readonly library = 'NORM';
  public readonly model: string;

  constructor(
    message: string,
    meta: { model: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
    this.model = meta.model;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-${this.model}] ${this.message}`;
  }
}

import { TundraLibError } from '../../utils/TundraLibError.ts';

export class DAMError extends TundraLibError {
  public readonly library = 'DAM';
  declare meta: { dialect: string } & Record<string, unknown>;

  constructor(
    message: string,
    meta: { dialect: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get dialect(): string {
    return this.meta.dialect;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.dialect} ${this.name}] ${this.message}`;
  }
}

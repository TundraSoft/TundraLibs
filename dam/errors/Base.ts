import { TundraLibError } from '../../utils/TundraLibError.ts';

export class DAMBaseError extends TundraLibError {
  public readonly library = 'DAM';
  public readonly dialect: string;

  constructor(
    message: string,
    meta: { dialect: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
    this.dialect = meta.dialect as string || 'N/A';
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.dialect} ${this.name}] ${this.message}`;
  }
}

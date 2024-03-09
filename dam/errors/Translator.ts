import { DAMBaseError } from './Base.ts';

export class DAMTranslatorBaseError extends DAMBaseError {
  constructor(
    message: string,
    meta: { dialect: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.dialect} ${this.name}] ${this.message}`;
  }
}

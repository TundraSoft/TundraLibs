import { NORMError } from '../Base.ts';

export class NORMValidatorError extends NORMError {
  public readonly column: string;

  constructor(
    message: string,
    meta: { model: string; column: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
    this.column = meta.column;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-VALIDATION-${this.model}.${this.column}] ${this.message}`;
  }
}

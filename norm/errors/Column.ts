import { NORMError } from './Base.ts';

export class NORMColumnError extends NORMError {
  declare public readonly meta:
    & { model: string; column: string }
    & Record<string, unknown>;

  constructor(
    message: string,
    meta: { model: string; column: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get column(): string {
    return this.meta.column;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-${this.model}.${this.column}] ${this.message}`;
  }
}

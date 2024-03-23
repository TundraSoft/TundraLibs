import { BaseError } from '../../utils/mod.ts';

export class NORMError extends BaseError {
  public readonly library = 'NORM';
  declare public readonly meta: { model: string } & Record<string, unknown>;

  constructor(
    message: string,
    meta: { model: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get model(): string {
    return this.meta.model;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-${this.model}] ${this.message}`;
  }
}

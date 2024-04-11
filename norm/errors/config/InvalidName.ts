import { NORMConfigError } from './Base.ts';

export class NORMInvalidTypeConfigError extends NORMConfigError {
  declare public readonly meta: {
    model: string;
    item: 'COLUMN' | 'EXPRESSION' | 'CONSTRAINT';
    column: string;
    type: string;
  };

  constructor(
    name: string,
    meta: { model: string; item: 'COLUMN'; column: string; type: string },
    cause?: Error,
  ) {
    super(`Invalid name ${name}`, meta, cause);
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-${this.model}] ${this.message}`;
  }
}

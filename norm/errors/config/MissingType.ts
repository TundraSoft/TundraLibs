import { NORMConfigError } from './Base.ts';

export class NORMMissingTypeConfigError extends NORMConfigError {
  declare public readonly meta: {
    model: string;
    item: 'COLUMN' | 'EXPRESSION' | 'CONSTRAINT';
    column: string;
  };

  constructor(
    meta: { model: string; item: 'COLUMN'; column: string },
    cause?: Error,
  ) {
    super(
      `Type declaration missing for column ${meta.model}.${meta.column}`,
      meta,
      cause,
    );
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-${this.model}] ${this.message}`;
  }
}

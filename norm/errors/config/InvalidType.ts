import { NORMConfigError } from './Base.ts';

export class NORMInvalidTypeConfigError extends NORMConfigError {
  declare public readonly meta: {
    model: string;
    item: 'COLUMN' | 'EXPRESSION' | 'CONSTRAINT';
    column: string;
    type: string;
  };

  constructor(
    meta: { model: string; item: 'COLUMN'; column: string; type: string },
    cause?: Error,
  ) {
    super(
      `Invalid/Unknown type definition for ${meta.model}.${meta.column}`,
      meta,
      cause,
    );
  }

  get type(): string {
    return this.meta.type;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-${this.model}] ${this.message}`;
  }
}

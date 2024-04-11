import { NORMError } from '../Base.ts';

export class NORMConfigError extends NORMError {
  declare public readonly meta: {
    model: string;
    item: 'COLUMN' | 'EXPRESSION' | 'CONSTRAINT';
  };

  constructor(
    message: string,
    meta: { model: string; item: 'COLUMN' | 'EXPRESSION' | 'CONSTRAINT' },
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get item(): string {
    return this.meta.item;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library}-${this.model}] ${this.message}`;
  }
}

import { NORMValidatorError } from './Base.ts';

export class NORMValidatorRangeError extends NORMValidatorError {
  constructor(model: string, column: string, from: string, to: string) {
    super(``, { model: model, column: column });
  }
}

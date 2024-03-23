import { NORMColumnError } from '../Column.ts';

export class NORMInvalidTypeError extends NORMColumnError {
  constructor(dataType: string, model: string, column: string) {
    super(`Invalid definition parameters for ${dataType}`, { model, column });
  }
}

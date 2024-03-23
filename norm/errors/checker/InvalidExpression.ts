import { NORMColumnError } from '../Column.ts';

export class NORMInvalidExpression extends NORMColumnError {
  constructor(expression: string, model: string, column: string) {
    super(`Invalid/unknown expression ${expression}`, { model, column });
  }
}

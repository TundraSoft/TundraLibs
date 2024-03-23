import { NORMColumnError } from '../Column.ts';

export class NORMMissingTypeError extends NORMColumnError {
  constructor(model: string, column: string) {
    super(`Column ${column} does not have a type definition`, {
      model,
      column,
    });
  }
}

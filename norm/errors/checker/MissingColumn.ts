import { NORMColumnError } from '../Column.ts';

export class NORMMissingColumnError extends NORMColumnError {
  constructor(model: string, column: string) {
    super(`Column not found`, { model, column });
  }
}

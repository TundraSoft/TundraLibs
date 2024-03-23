import { NORMColumnError } from '../Column.ts';

export class NORMInvalidValidationError extends NORMColumnError {
  constructor(
    validationType: 'LOV' | 'RANGE' | 'PATTERN',
    model: string,
    column: string,
  ) {
    super(`Invalid validation definition for ${validationType}`, {
      model,
      column,
    });
  }
}

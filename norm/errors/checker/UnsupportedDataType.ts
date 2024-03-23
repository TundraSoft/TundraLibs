import { NORMColumnError } from '../Column.ts';

export class NORMUnsupportedDataType extends NORMColumnError {
  constructor(dataType: string, model: string, column: string) {
    super(`Unknown data type ${dataType}`, { model, column });
  }
}

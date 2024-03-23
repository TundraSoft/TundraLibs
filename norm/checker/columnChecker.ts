import type { ColumnDefinition } from '../types/mod.ts';
import { DataTypeNames } from '../../dam/mod.ts';
import {
  NORMInvalidTypeError,
  NORMInvalidValidationError,
  NORMMissingTypeError,
  NORMUnsupportedDataType,
} from '../errors/mod.ts';

// type ColumnLength = [number, number] | [number];
// type ColumnValidation = {
//   lov?: Array<bigint | number | Date | string>;
//   range?: [bigint | number | Date, bigint | number | Date];
//   pattern?: string;
// };

export const columnChecker = (
  model: string,
  name: string,
  definition: ColumnDefinition,
) => {
  if (definition.type === undefined) {
    throw new NORMMissingTypeError(model, name);
  }

  if (!DataTypeNames.includes(definition.type)) {
    throw new NORMUnsupportedDataType(definition.type, model, name);
  }

  // Serial and auto incriment columns cannot be nullable
  if (
    ['SERIAL', 'AUTO_INCREMENT', 'BIGSERIAL'].includes(definition.type) &&
    definition.nullable === true
  ) {
    throw new NORMInvalidTypeError(definition.type, model, name);
  }

  if (
    [
      'NUMERIC',
      'DECIMAL',
      'FLOAT',
      'DOUBLE',
      'REAL',
      'CHAR',
      'VARCHAR',
      'TEXT',
      'BINARY',
      'BLOB',
    ].includes(definition.type)
  ) {
    const { length } = { ...{ length: undefined }, ...definition };
    if (length !== undefined) {
      if (
        ['NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'REAL'].includes(
          definition.type,
        )
      ) {
        if (length.length === 2 && length[1] > length[0]) {
          // Throw error
          throw new NORMInvalidTypeError(definition.type, model, name);
        }
      } else if (
        ['CHAR', 'VARCHAR', 'TEXT', 'BINARY', 'BLOB'].includes(definition.type)
      ) {
        if (length.length !== 1) {
          // Throw error
          throw new NORMInvalidTypeError(definition.type, model, name);
        }
      }
    }
  }

  if (
    ![
      'SERIAL',
      'AUTO_INCREMENT',
      'BIGSERIAL',
      'BIT',
      'BOOL',
      'BOOLEAN',
      'JSON',
      'JSONB',
      'UUID',
      'GUID',
    ].includes(definition.type)
  ) {
    const { lov, range, pattern } = {
      ...{ lov: undefined, range: undefined, pattern: undefined },
      ...definition,
    };
    // LOV is present, check against them
    if (lov !== undefined) {
      // All LOV's must be of the same type as the column
      if (
        ['NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'REAL'].includes(
          definition.type,
        )
      ) {
        if (lov.some((value) => typeof value !== 'number')) {
          // Throw error
          throw new NORMInvalidValidationError('LOV', model, name);
        }
      } else if (['BIGINT', 'AUTO_INCRIMENT'].includes(definition.type)) {
        if (lov.some((value) => typeof value !== 'bigint')) {
          // Throw error
          throw new NORMInvalidValidationError('LOV', model, name);
        }
      } else if (
        ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'TIMESTAMPTZ'].includes(
          definition.type,
        )
      ) {
        if (lov.some((value) => isNaN(Date.parse(value as string)))) {
          // Throw error
          throw new NORMInvalidValidationError('LOV', model, name);
        }
      } else {
        if (lov.some((value) => typeof value !== 'string')) {
          // Throw error
          throw new NORMInvalidValidationError('LOV', model, name);
        }
      }
    }

    // Range would not be present for CHAR, VARCHAR, TEXT, BINARY, BLOB
    if (range !== undefined) {
      // Range values must be of the same type as the column
      if (range[0] > range[1]) {
        // Throw error
        throw new NORMInvalidValidationError('RANGE', model, name);
      }
    }

    // Pattern would be present for CHAR, VARCHAR, TEXT, BINARY, BLOB
    if (pattern !== undefined) {
      // Pattern must be a valid regex
      try {
        new RegExp(pattern);
      } catch {
        // Throw error
        throw new NORMInvalidValidationError('PATTERN', model, name);
      }
    }
  }
};

console.log(isNaN(Date.parse('1')));

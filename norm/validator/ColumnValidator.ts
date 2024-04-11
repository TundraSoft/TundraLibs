import { DataTypeNames, type Expressions } from '../../dam/mod.ts';
import type { ColumnDefinition, SchemaDefinition } from '../types/mod.ts';
import { isValidName } from './isValidName.ts';
import { ExpressionValidator } from './ExpressionValidator.ts';
import { NORMColumnConfigError, NORMInvalidNameError } from '../errors/mod.ts';
import { TableDefinition } from '../types/definitions/mod.ts';

export const ColumnValidator = (
  column: ColumnDefinition,
  columnName: string,
  model: string,
  schema: SchemaDefinition,
) => {
  if (isValidName(columnName, false)) {
    throw new NORMInvalidNameError({
      model,
      value: columnName,
      item: 'column',
      isDBName: false,
    });
  }
  const {
    name,
    type,
    length,
    nullable,
    defaults,
    lov,
    range,
    pattern,
  } = {
    ...{
      length: undefined,
      defaults: undefined,
      lov: undefined,
      range: undefined,
      pattern: undefined,
    },
    ...(column as ColumnDefinition),
  };
  if (name && !isValidName(name, true)) {
    throw new NORMInvalidNameError({
      model,
      value: name,
      item: 'column',
      isDBName: true,
    });
  }
  if (!type) {
    throw new NORMColumnConfigError({
      model,
      column: columnName,
      item: 'type',
    });
  }
  if (!DataTypeNames.includes(type)) {
    throw new NORMColumnConfigError({
      model,
      column: columnName,
      item: 'type',
    });
  }
  // if(column.type === 'JSON' && column.structure) {
  //   Object.entries(column.structure).forEach(([subColumnName, subColumnType]) => {
  //     if(!isValidDBObjectName(subColumnName)) {
  //       throw new Error(`Column "${columnName}" structure name "${subColumnName}" is invalid`);
  //     }
  //     if(!['UUID', 'VARCHAR', 'TEXT', 'INTEGER', 'BOOLEAN', 'DATE', 'TIMESTAMPTZ'].includes(subColumnType)) {
  //       throw new Error(`Column "${columnName}" structure type "${subColumnType}" is invalid`);
  //     }
  //   });
  // }
  // Length validation
  if (length) {
    if (
      !Array.isArray(length) || (length.length > 0 && length.length <= 2) ||
      (length.length === 2 && length[0] > length[1])
    ) {
      throw new NORMColumnConfigError({
        model,
        column: columnName,
        item: 'length',
      });
    }
    if (length.length === 2) {
      if (
        !['NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'REAL'].includes(
          type,
        )
      ) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'length',
        });
      }
    }
    // @TODO - Check if type is correct
  }
  // Defaults validation
  if (defaults) {
    if (
      defaults.insert &&
      (typeof defaults.insert === 'object' &&
        Object.keys(defaults.insert).includes('$expr'))
    ) {
      // Can be value or expression. If expression, it cannot contain column names (Insert limitation)
      ExpressionValidator(
        defaults.insert as Expressions,
        columnName,
        model,
        [],
      );
    }
    if (
      defaults.update &&
      (typeof defaults.insert === 'object' &&
        Object.keys(defaults.insert).includes('$expr'))
    ) {
      // Can be value or expression. Can contain column names but not of joins
      ExpressionValidator(
        defaults.update as Expressions,
        columnName,
        model,
        Object.keys(schema[model].columns),
      );
    }
  }
  // LOV validation
  if (lov) {
    if (!Array.isArray(lov) || lov.length === 0) {
      throw new NORMColumnConfigError({
        model,
        column: columnName,
        item: 'lov',
      });
    }
    // @TODO - Check if type is correct
    if (['NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'REAL'].includes(type)) {
      if (lov.some((item) => typeof item !== 'number')) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'lov',
        });
      }
    } else if (['CHAR', 'VARCHAR', 'TEXT'].includes(type)) {
      if (lov.some((item) => typeof item !== 'string')) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'lov',
        });
      }
    } else if (
      ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'TIMESTAMPTZ'].includes(type)
    ) {
      if (lov.some((item) => !(item instanceof Date))) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'lov',
        });
      }
    }
  }
  // Range validation
  if (range) {
    if (!Array.isArray(range) || range.length !== 2 || range[0] > range[1]) {
      throw new NORMColumnConfigError({
        model,
        column: columnName,
        item: 'range',
      });
    }
    if (!Array.isArray(lov) || lov.length === 0) {
      throw new NORMColumnConfigError({
        model,
        column: columnName,
        item: 'range',
      });
    }
    // @TODO - Check if type is correct
    if (['NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'REAL'].includes(type)) {
      if (range.some((item) => typeof item !== 'number')) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'range',
        });
      }
    } else if (['CHAR', 'VARCHAR', 'TEXT'].includes(type)) {
      if (range.some((item) => typeof item !== 'string')) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'range',
        });
      }
    } else if (
      ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'TIMESTAMPTZ'].includes(type)
    ) {
      if (range.some((item) => !(item instanceof Date))) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'range',
        });
      }
    }
  }
  // Pattern validation
  if (pattern) {
    // Check if string is valid regex
    try {
      new RegExp(pattern);
    } catch {
      throw new NORMColumnConfigError({
        model,
        column: columnName,
        item: 'pattern',
      });
    }
  }

  if (nullable) {
    if (typeof nullable !== 'boolean') {
      throw new NORMColumnConfigError({
        model,
        column: columnName,
        item: 'nullable',
      });
    }
    // Nullable column cannot be in PK
    if ((schema[model] as TableDefinition).primaryKeys) {
      if (
        (schema[model] as TableDefinition).primaryKeys?.includes(columnName)
      ) {
        throw new NORMColumnConfigError({
          model,
          column: columnName,
          item: 'nullable',
        });
      }
    }
  }
};

import type { Expressions } from '../../dam/mod.ts';
import type { ColumnDefinition, TableDefinition } from '../types/mod.ts';
import { columnChecker } from './columnChecker.ts';
import { expressionChecker } from './expressionChecker.ts';

export const tableChecker = (model: string, definition: TableDefinition) => {
  if (definition.type !== 'TABLE') {
    throw new Error(`Invalid definition type ${definition.type}`);
  }

  if (definition.name === undefined) {
    throw new Error('Table name is required');
  }

  if (definition.name.includes(' ')) {
    throw new Error('Table name cannot contain spaces');
  }

  if (!definition.columns) {
    throw new Error('Columns definition is required');
  }

  const columnNames = Object.keys(definition.columns);
  Object.entries(definition.columns).forEach(([column, columnDefinition]) => {
    if (Object.keys(columnDefinition).includes('$expr')) {
      expressionChecker(
        model,
        column,
        columnDefinition as Expressions,
        columnNames,
      );
    } else {
      columnChecker(model, column, columnDefinition as ColumnDefinition);
    }
  });

  // Check primary key
  const { primaryKeys, uniqueKeys, foreignKeys } = definition;
  if (primaryKeys && primaryKeys.length > 0) {
    primaryKeys.forEach((pk) => {
      if (!columnNames.includes(pk)) {
        throw new Error(`Primary key ${pk} not found in columns`);
      }
    });
  }

  if (uniqueKeys) {
    Object.entries(uniqueKeys).forEach(([_key, columns]) => {
      columns.forEach((column) => {
        if (!columnNames.includes(column)) {
          throw new Error(`Column ${column} not found in columns`);
        }
      });
    });
  }

  if (foreignKeys) {
    Object.entries(foreignKeys).forEach(([_key, { relation }]) => {
      Object.entries(relation).forEach(([column, _refColumn]) => {
        if (!columnNames.includes(column)) {
          throw new Error(`Column ${column} not found in columns`);
        }
      });
    });
  }
};

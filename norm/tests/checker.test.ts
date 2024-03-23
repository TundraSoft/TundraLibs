import { assertThrows, describe, it } from '../../dev.dependencies.ts';
import {
  columnChecker,
  expressionChecker,
  tableChecker,
} from '../checker/mod.ts';
import {
  NORMInvalidExpression,
  NORMInvalidTypeError,
  NORMInvalidValidationError,
  NORMMissingTypeError,
  NORMUnsupportedDataType,
} from '../errors/mod.ts';
import type { Expressions } from '../../dam/mod.ts';
import type { ColumnDefinition, TableDefinition } from '../types/mod.ts';

describe('NORM', () => {
  describe('checker', () => {
    describe('columnChecker', () => {
      it('Missing type definition', () => {
        const model = 'test';
        const column = 'column';
        const definition = {};
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMMissingTypeError,
        );
      });

      it('Unsupported data type', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'UNSUPPORTED',
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMUnsupportedDataType,
        );
      });

      it('Invalid type for serial column', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'SERIAL',
          nullable: true,
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidTypeError,
        );
      });

      it('Invalid type for auto increment column', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'AUTO_INCREMENT',
          nullable: true,
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidTypeError,
        );
      });

      it('Invalid type for big serial column', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'BIGSERIAL',
          nullable: true,
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidTypeError,
        );
      });

      it('Invalid type for numeric column', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'NUMERIC',
          length: [1, 10],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidTypeError,
        );
      });

      it('Invalid type for decimal column', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'DECIMAL',
          length: [1, 10],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidTypeError,
        );
      });

      it('Invalid type of string columns', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'CHAR',
          length: [1, 10, 20],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidTypeError,
        );
      });

      it('Invalid range validation', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'INTEGER',
          range: [100, 10],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidValidationError,
        );
      });

      it('Invalid LOV validation number', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'INTEGER',
          lov: [1, 2, 3, 'foo'],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidValidationError,
        );
      });

      it('Invalid LOV validation bigint', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'BIGINT',
          lov: [1, 2, 3],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidValidationError,
        );
      });

      it('Invalid LOV validation char', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'VARCHAR',
          lov: [1, 2, 3],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidValidationError,
        );
      });

      it('Invalid LOV validation date', () => {
        const model = 'test';
        const column = 'column';
        const definition = {
          type: 'DATE',
          lov: ['sdf', '234ds'],
        };
        assertThrows(
          () => columnChecker(model, column, definition as ColumnDefinition),
          NORMInvalidValidationError,
        );
      });
    });

    describe('expressionChecker', () => {
      it('Invalid expression', () => {
        const model = 'test';
        const name = 'column';
        const expression = { $expr: 'KJHGVJHVJHV' };
        assertThrows(
          () => expressionChecker(model, name, expression as Expressions),
          NORMInvalidExpression,
        );
      });

      it('Invalid expression in arg', () => {
        const model = 'test';
        const name = 'column';
        const expression = { $expr: 'CONCAT', $args: [{ $expr: 'asdfsdf' }] };
        assertThrows(
          () => expressionChecker(model, name, expression as Expressions),
          NORMInvalidExpression,
        );
      });

      it('Missing column in args', () => {
        const model = 'test';
        const name = 'column';
        const expression = { $expr: 'CONCAT', $args: ['$column2'] };
        assertThrows(
          () =>
            expressionChecker(model, name, expression as Expressions, [
              'col',
              'col3',
            ]),
          Error,
        );
      });

      it('Self referencing column name', () => {
        const model = 'test';
        const name = 'column';
        const expression = { $expr: 'CONCAT', $args: ['$column'] };
        assertThrows(
          () =>
            expressionChecker(model, name, expression as Expressions, [
              'col',
              'col3',
              'column',
            ]),
          Error,
        );
      });
    });

    describe('tableChecker', () => {
      it('Missing name', () => {
        const model = 'test';
        const definition = {
          columns: {
            column: {
              type: 'INTEGER',
            },
          },
        };
        assertThrows(
          () => tableChecker(model, definition as unknown as TableDefinition),
          Error,
        );
      });

      it('Missing/invalid type', () => {
        const model = 'test';
        const definition = {
          name: 'sdf',
          type: 'INVALID',
          columns: {
            column: {
              type: 'INTEGER',
            },
          },
        };
        assertThrows(
          () => tableChecker(model, definition as unknown as TableDefinition),
          Error,
        );
      });

      it('Missing columns', () => {
        const model = 'test';
        const definition = {
          name: 'table',
        };
        assertThrows(
          () => tableChecker(model, definition as TableDefinition),
          Error,
        );
      });

      describe('Constraint validation', () => {
        it('Invalid Primary key', () => {
          const model = 'test';
          const definition = {
            name: 'table',
            type: 'TABLE',
            columns: {
              column: {
                type: 'INTEGER',
              },
            },
            primaryKeys: ['columnd'],
          };
          assertThrows(
            () => tableChecker(model, definition as TableDefinition),
            Error,
          );
        });

        it('Invalid Unique key', () => {
          const model = 'test';
          const definition = {
            name: 'table',
            type: 'TABLE',
            columns: {
              column: {
                type: 'INTEGER',
              },
            },
            uniqueKeys: { test: ['columnd'] },
          };
          assertThrows(
            () => tableChecker(model, definition as TableDefinition),
            Error,
          );
        });

        it('Invalid Foreign key', () => {
          const model = 'test';
          const definition = {
            name: 'table',
            type: 'TABLE',
            columns: {
              column: {
                type: 'INTEGER',
              },
            },
            foreignKeys: {
              test: {
                model: 'A',
                contains: 'SINGLE',
                relation: { columnf: 'column' },
              },
            },
          };
          assertThrows(
            () => tableChecker(model, definition as TableDefinition),
            Error,
          );
        });
      });
    });
  });
});

/**
 * @fileoverview Tests for shared DDL validators.
 * @module
 */

import { describe, it } from '@tundralibs/compat';
import * as asserts from '@std/asserts';
import {
  validateColumnDefinition,
  validateForeignKeyConstraint,
  validateIdentifierName,
} from './common.ts';

// =============================================================================
// Test Data
// =============================================================================

const VALID_IDENTIFIERS = [
  'users',
  'user_id',
  '_private',
  'Table123',
  'a',
  'A1B2C3',
  'column_name_with_many_underscores',
];

const INVALID_IDENTIFIERS = [
  ['', 'empty or whitespace'],
  ['  ', 'empty or whitespace'],
  ['123abc', 'must start with a letter or underscore'],
  ['user-name', 'must start with a letter or underscore'],
  ['user name', 'must start with a letter or underscore'],
  ['user$name', 'must start with a letter or underscore'],
  ['user.name', 'must start with a letter or underscore'],
  ['a'.repeat(64), 'exceeds maximum length of 63 characters'],
];

// =============================================================================
// Test Suites
// =============================================================================

describe('oql.asserts.Query.DDL.Common', () => {
  describe('validateIdentifierName', () => {
    const types = [
      'table',
      'column',
      'constraint',
      'schema',
      'index',
      'view',
    ] as const;

    describe('Valid identifiers', () => {
      for (const name of VALID_IDENTIFIERS) {
        for (const type of types) {
          it(`should accept valid ${type} name: '${name}'`, () => {
            // Should not throw
            validateIdentifierName(name, type, 'test');
          });
        }
      }
    });

    describe('Invalid identifiers', () => {
      for (const [name, reason] of INVALID_IDENTIFIERS) {
        for (const type of types) {
          it(`should reject ${type} name '${name}' (${reason})`, () => {
            asserts.assertThrows(
              () => validateIdentifierName(name as string, type, 'test'),
              TypeError,
            );
          });
        }
      }
    });

    it('should include context in error message', () => {
      asserts.assertThrows(
        () => validateIdentifierName('', 'table', 'CREATE_TABLE'),
        TypeError,
        'Invalid CREATE_TABLE',
      );
    });

    it('should include type in error message', () => {
      asserts.assertThrows(
        () => validateIdentifierName('', 'column', 'test'),
        TypeError,
        'column name',
      );
    });
  });

  describe('validateColumnDefinition', () => {
    describe('Valid column definitions', () => {
      it('should accept VARCHAR column', () => {
        validateColumnDefinition(
          'email',
          { type: 'VARCHAR', length: 255 },
          'test',
        );
      });

      it('should accept CHAR column', () => {
        validateColumnDefinition('code', { type: 'CHAR', length: 10 }, 'test');
      });

      it('should accept TEXT column without length', () => {
        validateColumnDefinition('description', { type: 'TEXT' }, 'test');
      });

      it('should accept INTEGER column', () => {
        validateColumnDefinition('age', { type: 'INTEGER' }, 'test');
      });

      it('should accept DECIMAL with precision', () => {
        validateColumnDefinition(
          'price',
          { type: 'DECIMAL', precision: 10 },
          'test',
        );
      });

      it('should accept DECIMAL with precision and scale', () => {
        validateColumnDefinition('amount', {
          type: 'DECIMAL',
          precision: 10,
          scale: 2,
        }, 'test');
      });

      it('should accept NUMERIC with precision and scale', () => {
        validateColumnDefinition('total', {
          type: 'NUMERIC',
          precision: 12,
          scale: 4,
        }, 'test');
      });

      it('should accept nullable property', () => {
        validateColumnDefinition(
          'optional',
          { type: 'TEXT', nullable: true },
          'test',
        );
      });

      it('should accept comment property', () => {
        validateColumnDefinition('id', {
          type: 'INTEGER',
          comment: 'Primary key',
        }, 'test');
      });

      it('should accept all valid SQL types', () => {
        const types = [
          'CHAR',
          'VARCHAR',
          'TEXT',
          'CLOB',
          'TINYINT',
          'SMALLINT',
          'INTEGER',
          'INT',
          'BIGINT',
          'DECIMAL',
          'NUMERIC',
          'FLOAT',
          'DOUBLE',
          'REAL',
          'BINARY',
          'VARBINARY',
          'BLOB',
          'DATE',
          'TIME',
          'DATETIME',
          'TIMESTAMP',
          'BOOLEAN',
          'BIT',
          'JSON',
          'JSONB',
          'UUID',
          'XML',
        ];

        for (const type of types) {
          validateColumnDefinition('col', { type }, 'test');
        }
      });

      it('should accept BINARY with length', () => {
        validateColumnDefinition(
          'data',
          { type: 'BINARY', length: 16 },
          'test',
        );
      });

      it('should accept VARBINARY with length', () => {
        validateColumnDefinition(
          'data',
          { type: 'VARBINARY', length: 256 },
          'test',
        );
      });
    });

    describe('Invalid column definitions', () => {
      it('should throw for non-object definition', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('col', 'TEXT', 'test'),
          TypeError,
          'must be an object',
        );
      });

      it('should throw for null definition', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('col', null, 'test'),
          TypeError,
          'must be an object',
        );
      });

      it('should throw for array definition', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('col', [], 'test'),
          TypeError,
          'must have a type',
        );
      });

      it('should throw for missing type', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('col', {}, 'test'),
          TypeError,
          'must have a type',
        );
      });

      it('should throw for null type', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('col', { type: null }, 'test'),
          TypeError,
          'must have a type',
        );
      });

      it('should throw for undefined type', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('col', { type: undefined }, 'test'),
          TypeError,
          'must have a type',
        );
      });

      it('should throw for non-string type', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('col', { type: 123 }, 'test'),
          TypeError,
          'type must be a string',
        );
      });

      it('should throw for invalid SQL type', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition('col', { type: 'INVALID_TYPE' }, 'test'),
          TypeError,
          'invalid SQL type',
        );
      });

      it('should throw for length on TEXT', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'TEXT', length: 100 },
              'test',
            ),
          TypeError,
          'cannot have length property',
        );
      });

      it('should throw for length on INTEGER', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'INTEGER', length: 10 },
              'test',
            ),
          TypeError,
          'cannot have length property',
        );
      });

      it('should throw for non-integer length', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'VARCHAR', length: 10.5 },
              'test',
            ),
          TypeError,
          'length must be a positive integer',
        );
      });

      it('should throw for zero length', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'VARCHAR', length: 0 },
              'test',
            ),
          TypeError,
          'length must be a positive integer',
        );
      });

      it('should throw for negative length', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'VARCHAR', length: -1 },
              'test',
            ),
          TypeError,
          'length must be a positive integer',
        );
      });

      it('should throw for precision on VARCHAR', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'VARCHAR', precision: 10 },
              'test',
            ),
          TypeError,
          'cannot have precision property',
        );
      });

      it('should throw for non-integer precision', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition('col', {
              type: 'DECIMAL',
              precision: 10.5,
            }, 'test'),
          TypeError,
          'precision must be a positive integer',
        );
      });

      it('should throw for zero precision', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'DECIMAL', precision: 0 },
              'test',
            ),
          TypeError,
          'precision must be a positive integer',
        );
      });

      it('should throw for negative precision', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'DECIMAL', precision: -1 },
              'test',
            ),
          TypeError,
          'precision must be a positive integer',
        );
      });

      it('should throw for scale on INTEGER', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'INTEGER', scale: 2 },
              'test',
            ),
          TypeError,
          'cannot have scale property',
        );
      });

      it('should throw for non-integer scale', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition('col', {
              type: 'DECIMAL',
              precision: 10,
              scale: 2.5,
            }, 'test'),
          TypeError,
          'scale must be a non-negative integer',
        );
      });

      it('should throw for negative scale', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition('col', {
              type: 'DECIMAL',
              precision: 10,
              scale: -1,
            }, 'test'),
          TypeError,
          'scale must be a non-negative integer',
        );
      });

      it('should throw for scale exceeding precision', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition('col', {
              type: 'DECIMAL',
              precision: 5,
              scale: 10,
            }, 'test'),
          TypeError,
          'scale (10) cannot exceed precision (5)',
        );
      });

      it('should throw for non-boolean nullable', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'TEXT', nullable: 'yes' },
              'test',
            ),
          TypeError,
          'nullable must be a boolean',
        );
      });

      it('should throw for non-string comment', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'TEXT', comment: 123 },
              'test',
            ),
          TypeError,
          'comment must be a string',
        );
      });

      it('should include column name in error message', () => {
        asserts.assertThrows(
          () => validateColumnDefinition('email', { type: 'INVALID' }, 'test'),
          TypeError,
          "column 'email'",
        );
      });

      it('should include context in error message', () => {
        asserts.assertThrows(
          () =>
            validateColumnDefinition(
              'col',
              { type: 'INVALID' },
              'CREATE_TABLE',
            ),
          TypeError,
          'Invalid CREATE_TABLE',
        );
      });
    });
  });

  describe('validateForeignKeyConstraint', () => {
    describe('Valid foreign key constraints', () => {
      it('should accept basic foreign key', () => {
        validateForeignKeyConstraint(
          'fk_user',
          {
            columns: ['user_id'],
            references: {
              table: 'users',
              columns: ['id'],
            },
          },
          ['user_id'],
          'test',
        );
      });

      it('should accept foreign key with schema', () => {
        validateForeignKeyConstraint(
          'fk_user',
          {
            columns: ['user_id'],
            references: {
              schema: 'public',
              table: 'users',
              columns: ['id'],
            },
          },
          ['user_id'],
          'test',
        );
      });

      it('should accept composite foreign key', () => {
        validateForeignKeyConstraint(
          'fk_composite',
          {
            columns: ['col1', 'col2'],
            references: {
              table: 'other',
              columns: ['ref1', 'ref2'],
            },
          },
          ['col1', 'col2'],
          'test',
        );
      });

      it('should accept onDelete CASCADE', () => {
        validateForeignKeyConstraint(
          'fk_cascade',
          {
            columns: ['user_id'],
            references: {
              table: 'users',
              columns: ['id'],
            },
            onDelete: 'CASCADE',
          },
          ['user_id'],
          'test',
        );
      });

      it('should accept onUpdate SET_NULL', () => {
        validateForeignKeyConstraint(
          'fk_update',
          {
            columns: ['user_id'],
            references: {
              table: 'users',
              columns: ['id'],
            },
            onUpdate: 'SET_NULL',
          },
          ['user_id'],
          'test',
        );
      });

      it('should accept all valid FK actions', () => {
        const actions = [
          'CASCADE',
          'SET_NULL',
          'SET_DEFAULT',
          'RESTRICT',
          'NO_ACTION',
        ];
        for (const action of actions) {
          validateForeignKeyConstraint(
            'fk_test',
            {
              columns: ['user_id'],
              references: {
                table: 'users',
                columns: ['id'],
              },
              onDelete: action,
              onUpdate: action,
            },
            ['user_id'],
            'test',
          );
        }
      });

      it('should skip column existence check when columnNames is empty', () => {
        validateForeignKeyConstraint(
          'fk_alter',
          {
            columns: ['new_column'],
            references: {
              table: 'users',
              columns: ['id'],
            },
          },
          [],
          'test',
        );
      });
    });

    describe('Invalid foreign key constraints', () => {
      it('should throw for non-object constraint', () => {
        asserts.assertThrows(
          () => validateForeignKeyConstraint('fk', 'invalid', [], 'test'),
          TypeError,
          'must be an object',
        );
      });

      it('should throw for null constraint', () => {
        asserts.assertThrows(
          () => validateForeignKeyConstraint('fk', null, [], 'test'),
          TypeError,
          'must be an object',
        );
      });

      it('should throw for array constraint', () => {
        asserts.assertThrows(
          () => validateForeignKeyConstraint('fk', [], [], 'test'),
          TypeError,
          'must be an object',
        );
      });

      it('should throw for missing columns', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                references: { table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          "must have non-empty 'columns' array",
        );
      });

      it('should throw for non-array columns', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: 'user_id',
                references: { table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          "must have non-empty 'columns' array",
        );
      });

      it('should throw for empty columns array', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: [],
                references: { table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          "must have non-empty 'columns' array",
        );
      });

      it('should throw for non-string column', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: [123],
                references: { table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'column must be a string',
        );
      });

      it('should throw for non-existent column', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['missing'],
                references: { table: 'users', columns: ['id'] },
              },
              ['existing'],
              'test',
            ),
          TypeError,
          'does not exist in columns definition',
        );
      });

      it('should throw for missing references', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
              },
              [],
              'test',
            ),
          TypeError,
          "must have 'references' object",
        );
      });

      it('should throw for non-object references', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: 'users',
              },
              [],
              'test',
            ),
          TypeError,
          "must have 'references' object",
        );
      });

      it('should throw for null references', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: null,
              },
              [],
              'test',
            ),
          TypeError,
          "must have 'references' object",
        );
      });

      it('should throw for missing references.table', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.table must be a non-empty string',
        );
      });

      it('should throw for non-string references.table', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 123, columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.table must be a non-empty string',
        );
      });

      it('should throw for empty references.table', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: '  ', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.table must be a non-empty string',
        );
      });

      it('should throw for invalid references.table name', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: '123invalid', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'must start with a letter or underscore',
        );
      });

      it('should throw for non-string references.schema', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { schema: 123, table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.schema must be a non-empty string',
        );
      });

      it('should throw for empty references.schema', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { schema: '  ', table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.schema must be a non-empty string',
        );
      });

      it('should throw for invalid references.schema name', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: {
                  schema: 'invalid-name',
                  table: 'users',
                  columns: ['id'],
                },
              },
              [],
              'test',
            ),
          TypeError,
          'must start with a letter or underscore',
        );
      });

      it('should throw for missing references.columns', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 'users' },
              },
              [],
              'test',
            ),
          TypeError,
          'references.columns must be a non-empty array',
        );
      });

      it('should throw for non-array references.columns', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 'users', columns: 'id' },
              },
              [],
              'test',
            ),
          TypeError,
          'references.columns must be a non-empty array',
        );
      });

      it('should throw for empty references.columns', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 'users', columns: [] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.columns must be a non-empty array',
        );
      });

      it('should throw for column count mismatch', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['col1', 'col2'],
                references: { table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.columns length must match',
        );
      });

      it('should throw for non-string references.columns element', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 'users', columns: [123] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.columns must contain non-empty strings',
        );
      });

      it('should throw for empty string in references.columns', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 'users', columns: ['  '] },
              },
              [],
              'test',
            ),
          TypeError,
          'references.columns must contain non-empty strings',
        );
      });

      it('should throw for invalid onDelete action', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 'users', columns: ['id'] },
                onDelete: 'INVALID_ACTION',
              },
              [],
              'test',
            ),
          TypeError,
          'onDelete must be one of',
        );
      });

      it('should throw for invalid onUpdate action', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: ['user_id'],
                references: { table: 'users', columns: ['id'] },
                onUpdate: 'INVALID_ACTION',
              },
              [],
              'test',
            ),
          TypeError,
          'onUpdate must be one of',
        );
      });

      it('should include constraint name in error message', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk_user_posts',
              {
                columns: [],
                references: { table: 'users', columns: ['id'] },
              },
              [],
              'test',
            ),
          TypeError,
          "constraint 'fk_user_posts'",
        );
      });

      it('should include context in error message', () => {
        asserts.assertThrows(
          () =>
            validateForeignKeyConstraint(
              'fk',
              {
                columns: [],
                references: { table: 'users', columns: ['id'] },
              },
              [],
              'CREATE_TABLE',
            ),
          TypeError,
          'Invalid CREATE_TABLE',
        );
      });
    });
  });
});

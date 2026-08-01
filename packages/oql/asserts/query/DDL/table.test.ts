import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertAlterTable,
  assertCreateTable,
  assertDropTable,
  assertTruncate,
  isAlterTable,
  isCreateTable,
  isDropTable,
  isTruncate,
} from './table.ts';

describe('oql.asserts.Query.DDL.Table', () => {
  describe('assertCreateTable', () => {
    it('valid: minimal', () => {
      assertCreateTable({
        type: 'CREATE_TABLE',
        table: 'users',
        columns: { id: { type: 'INTEGER' } },
      });
    });

    it('valid: full feature set', () => {
      assertCreateTable({
        type: 'CREATE_TABLE',
        table: 'users',
        schema: 'public',
        columns: {
          id: { type: 'INTEGER', nullable: false },
          name: { type: 'VARCHAR', length: 255 },
          email: { type: 'VARCHAR', length: 320 },
          balance: { type: 'DECIMAL', precision: 10, scale: 2 },
          created_at: { type: 'TIMESTAMP' },
        },
        primaryKey: ['id'],
        uniqueKeys: { email_unique: ['email'] },
        ifNotExists: true,
      });
    });

    it('valid: foreign key referencing local columns', () => {
      assertCreateTable({
        type: 'CREATE_TABLE',
        table: 'orders',
        columns: {
          id: { type: 'INTEGER' },
          userId: { type: 'INTEGER' },
        },
        foreignKeys: {
          fk_user: {
            columns: ['userId'],
            references: { table: 'users', columns: ['id'] },
            onDelete: 'CASCADE',
          },
        },
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertCreateTable(null),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'DROP_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
          }),
        TypeError,
        "Expected type 'CREATE_TABLE'",
      );
    });

    it('invalid: missing columns', () => {
      asserts.assertThrows(
        () => assertCreateTable({ type: 'CREATE_TABLE', table: 'users' }),
        TypeError,
        'columns are required',
      );
    });

    it('invalid: columns is not an object', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: ['id'],
          }),
        TypeError,
        'must be an object',
      );
    });

    it('invalid: empty columns', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: {},
          }),
        TypeError,
        'at least one column is required',
      );
    });

    it('invalid: bad column name', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { 'bad-name': { type: 'INTEGER' } },
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: column missing type', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: {} },
          }),
        TypeError,
        'must have a type',
      );
    });

    it('invalid: column with bad SQL type', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'NOTAREALTYPE' } },
          }),
        TypeError,
        'invalid SQL type',
      );
    });

    it('invalid: length on INTEGER', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER', length: 10 } },
          }),
        TypeError,
        'cannot have length property',
      );
    });

    it('invalid: scale > precision', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { v: { type: 'DECIMAL', precision: 5, scale: 10 } },
          }),
        TypeError,
        'scale (10) cannot exceed precision (5)',
      );
    });

    it('invalid: primaryKey references unknown column', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            primaryKey: ['ghost'],
          }),
        TypeError,
        "primaryKey column 'ghost' does not exist",
      );
    });

    it('invalid: primaryKey not an array', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            primaryKey: 'id' as any,
          }),
        TypeError,
        'primaryKey must be an array',
      );
    });

    it('invalid: primaryKey empty array', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            primaryKey: [],
          }),
        TypeError,
        'primaryKey cannot be empty',
      );
    });

    it('invalid: primaryKey column not a string', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            primaryKey: [123] as any,
          }),
        TypeError,
        'primaryKey column must be a string',
      );
    });

    it('invalid: uniqueKeys not an object', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            uniqueKeys: [] as any,
          }),
        TypeError,
        'uniqueKeys must be an object',
      );

      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            uniqueKeys: null as any,
          }),
        TypeError,
        'uniqueKeys must be an object',
      );
    });

    it('invalid: uniqueKeys constraint not an array', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            uniqueKeys: { uk: 'id' as any },
          }),
        TypeError,
        "uniqueKeys constraint 'uk' must be an array",
      );
    });

    it('invalid: uniqueKeys constraint empty array', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            uniqueKeys: { uk: [] },
          }),
        TypeError,
        "uniqueKeys constraint 'uk' cannot be empty",
      );
    });

    it('invalid: uniqueKeys column not a string', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            uniqueKeys: { uk: [123] as any },
          }),
        TypeError,
        "uniqueKeys constraint 'uk' column must be a string",
      );
    });

    it('invalid: uniqueKeys references unknown column', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            uniqueKeys: { uk: ['ghost'] },
          }),
        TypeError,
        "uniqueKeys constraint 'uk' column 'ghost' does not exist",
      );
    });

    it('invalid: foreignKeys not an object', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            foreignKeys: [] as any,
          }),
        TypeError,
        'foreignKeys must be an object',
      );

      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            foreignKeys: null as any,
          }),
        TypeError,
        'foreignKeys must be an object',
      );
    });

    it('invalid: FK column count mismatch', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'orders',
            columns: { userId: { type: 'INTEGER' } },
            foreignKeys: {
              fk: {
                columns: ['userId'],
                references: { table: 'users', columns: ['id', 'tenant_id'] },
              },
            },
          }),
        TypeError,
        'references.columns length must match',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertCreateTable({
            type: 'CREATE_TABLE',
            table: 'users',
            columns: { id: { type: 'INTEGER' } },
            bogus: 1,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isCreateTable', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isCreateTable({
          type: 'CREATE_TABLE',
          table: 'users',
          columns: { id: { type: 'INTEGER' } },
        }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isCreateTable({ type: 'CREATE_TABLE' }), false);
      asserts.assertEquals(isCreateTable(null), false);
    });
  });

  describe('assertAlterTable', () => {
    it('valid: addColumns', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'users',
        addColumns: { phone: { type: 'VARCHAR', length: 20 } },
      });
    });

    it('valid: alterColumns', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'users',
        alterColumns: {
          name: { type: 'VARCHAR', length: 500, nullable: false },
        },
      });
    });

    it('valid: alterColumns with nullable explicit true', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'users',
        alterColumns: {
          name: { type: 'VARCHAR', length: 500, nullable: true },
        },
      });
    });

    it('valid: dropColumns', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'users',
        dropColumns: ['old_field'],
      });
    });

    it('valid: renameColumns', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'users',
        renameColumns: { email: 'email_address' },
      });
    });

    it('valid: addForeignKeys', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'orders',
        addForeignKeys: {
          fk_user: {
            columns: ['userId'],
            references: { table: 'users', columns: ['id'] },
          },
        },
      });
    });

    it('valid: dropForeignKeys', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'orders',
        dropForeignKeys: ['fk_user'],
      });
    });

    it('valid: renameTo', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'users',
        renameTo: 'app_users',
      });
    });

    it('valid: combined operations', () => {
      assertAlterTable({
        type: 'ALTER_TABLE',
        table: 'users',
        addColumns: { status: { type: 'VARCHAR', length: 50 } },
        dropColumns: ['legacy'],
        renameColumns: { email: 'email_address' },
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertAlterTable(null as any),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertAlterTable('ALTER_TABLE' as any),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertAlterTable(123 as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'CREATE_TABLE',
            table: 'users',
            addColumns: { x: { type: 'INTEGER' } },
          }),
        TypeError,
        "Expected type 'ALTER_TABLE'",
      );
    });

    it('invalid: missing table', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            renameTo: 'x',
          }),
        TypeError,
        "'table' is required",
      );
    });

    it('invalid: no modification operation', () => {
      asserts.assertThrows(
        () => assertAlterTable({ type: 'ALTER_TABLE', table: 'users' }),
        TypeError,
        'at least one modification operation',
      );
    });

    it('invalid: addColumns cannot be empty', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            addColumns: {},
          }),
        TypeError,
        'addColumns cannot be empty',
      );
    });

    it('invalid: alterColumns cannot be empty', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            alterColumns: {},
          }),
        TypeError,
        'alterColumns cannot be empty',
      );
    });

    it('invalid: alterColumns entry omits nullable', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            alterColumns: {
              name: { type: 'VARCHAR', length: 500 },
            },
          }),
        TypeError,
        'must set nullable explicitly',
      );
    });

    it('invalid: dropColumns not an array', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            dropColumns: 'old',
          }),
        TypeError,
        'dropColumns must be an array',
      );
    });

    it('invalid: dropColumns empty', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            dropColumns: [],
          }),
        TypeError,
        'dropColumns cannot be empty',
      );
    });

    it('invalid: dropColumns column not a string', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            dropColumns: [123 as any],
          }),
        TypeError,
        'dropColumns column must be a string',
      );
    });

    it('invalid: renameColumns not an object', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameColumns: [] as any,
          }),
        TypeError,
        'renameColumns must be an object',
      );

      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameColumns: null as any,
          }),
        TypeError,
        'renameColumns must be an object',
      );
    });

    it('invalid: renameColumns empty object', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameColumns: {},
          }),
        TypeError,
        'renameColumns cannot be empty',
      );
    });

    it('invalid: renameColumns new name not a string', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameColumns: { email: 123 as any },
          }),
        TypeError,
        'must be a string',
      );
    });

    it('invalid: renameColumns has bad new name', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameColumns: { email: '1bad' },
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: addForeignKeys not an object', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            addForeignKeys: [] as any,
          }),
        TypeError,
        'addForeignKeys must be an object',
      );

      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            addForeignKeys: null as any,
          }),
        TypeError,
        'addForeignKeys must be an object',
      );
    });

    it('invalid: addForeignKeys cannot be empty', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            addForeignKeys: {},
          }),
        TypeError,
        'addForeignKeys cannot be empty',
      );
    });

    it('invalid: dropForeignKeys not an array', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            dropForeignKeys: 'fk_name' as any,
          }),
        TypeError,
        'dropForeignKeys must be an array',
      );
    });

    it('invalid: dropForeignKeys empty array', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            dropForeignKeys: [],
          }),
        TypeError,
        'dropForeignKeys cannot be empty',
      );
    });

    it('invalid: dropForeignKeys with non-string entry', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            dropForeignKeys: [123],
          }),
        TypeError,
        'must be a string',
      );
    });

    it('invalid: renameTo not a string', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameTo: 123 as any,
          }),
        TypeError,
        'renameTo must be a string',
      );
    });

    it('invalid: bad renameTo identifier', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameTo: 'bad-name',
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertAlterTable({
            type: 'ALTER_TABLE',
            table: 'users',
            renameTo: 'x',
            bogus: 1,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isAlterTable', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isAlterTable({
          type: 'ALTER_TABLE',
          table: 'users',
          renameTo: 'x',
        }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isAlterTable({ type: 'ALTER_TABLE' }), false);
    });
  });

  describe('assertDropTable', () => {
    it('valid: minimal', () => {
      assertDropTable({ type: 'DROP_TABLE', table: 'users' });
    });

    it('valid: full options', () => {
      assertDropTable({
        type: 'DROP_TABLE',
        table: 'users',
        schema: 'public',
        ifExists: true,
        cascade: true,
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertDropTable(null as any),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertDropTable('DROP_TABLE' as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertDropTable({ type: 'CREATE_TABLE', table: 'users' }),
        TypeError,
        "Expected type 'DROP_TABLE'",
      );
    });

    it('invalid: missing table', () => {
      asserts.assertThrows(
        () => assertDropTable({ type: 'DROP_TABLE' }),
        TypeError,
        "'table' is required",
      );
    });

    it('invalid: bad table name', () => {
      asserts.assertThrows(
        () => assertDropTable({ type: 'DROP_TABLE', table: 'bad-name' }),
        TypeError,
        'must start with a letter',
      );
    });

    it('invalid: non-boolean ifExists', () => {
      asserts.assertThrows(
        () =>
          assertDropTable({
            type: 'DROP_TABLE',
            table: 'users',
            ifExists: 'yes',
          }),
        TypeError,
        'ifExists must be a boolean',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertDropTable({
            type: 'DROP_TABLE',
            table: 'users',
            bogus: 1,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isDropTable', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isDropTable({ type: 'DROP_TABLE', table: 'users' }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isDropTable({ type: 'DROP_TABLE' }), false);
    });
  });

  describe('assertTruncate', () => {
    it('valid: minimal', () => {
      assertTruncate({ type: 'TRUNCATE', table: 'users' });
    });

    it('valid: with schema and cascade', () => {
      assertTruncate({
        type: 'TRUNCATE',
        table: 'users',
        schema: 'public',
        cascade: true,
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertTruncate(null as any),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertTruncate('TRUNCATE' as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertTruncate({ type: 'DROP_TABLE', table: 'users' }),
        TypeError,
        "Expected type 'TRUNCATE'",
      );
    });

    it('invalid: missing table', () => {
      asserts.assertThrows(
        () => assertTruncate({ type: 'TRUNCATE' }),
        TypeError,
        "'table' is required",
      );
    });

    it('invalid: non-boolean cascade', () => {
      asserts.assertThrows(
        () =>
          assertTruncate({
            type: 'TRUNCATE',
            table: 'users',
            cascade: 'yes',
          }),
        TypeError,
        'cascade must be a boolean',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertTruncate({
            type: 'TRUNCATE',
            table: 'users',
            bogus: 1,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isTruncate', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isTruncate({ type: 'TRUNCATE', table: 'users' }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isTruncate({ type: 'TRUNCATE' }), false);
    });
  });
});

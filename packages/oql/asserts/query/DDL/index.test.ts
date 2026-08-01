import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertCreateIndex,
  assertDropIndex,
  isCreateIndex,
  isDropIndex,
} from './index.ts';

describe('oql.asserts.Query.DDL.Index', () => {
  describe('assertCreateIndex', () => {
    it('valid: minimal index', () => {
      assertCreateIndex({
        type: 'CREATE_INDEX',
        index: 'idx_users_email',
        table: 'users',
        columns: ['@email'],
      });
    });

    it('valid: with schema, method, unique, ifNotExists', () => {
      assertCreateIndex({
        type: 'CREATE_INDEX',
        index: 'idx_users_email_unique',
        table: 'users',
        schema: 'public',
        columns: ['@email'],
        method: 'BTREE',
        unique: true,
        ifNotExists: true,
      });
    });

    it('valid: composite index', () => {
      assertCreateIndex({
        type: 'CREATE_INDEX',
        index: 'idx_orders_user_status',
        table: 'orders',
        columns: ['@userId', '@status'],
      });
    });

    it('valid: partial index with where clause', () => {
      assertCreateIndex({
        type: 'CREATE_INDEX',
        index: 'idx_active_users',
        table: 'users',
        columns: ['@createdAt'],
        where: { '@status': 'active' },
      });
    });

    it('valid: each method type', () => {
      for (
        const method of ['BTREE', 'HASH', 'GIN', 'GIST', 'BRIN', 'FULLTEXT']
      ) {
        assertCreateIndex({
          type: 'CREATE_INDEX',
          index: `idx_${method.toLowerCase()}`,
          table: 'users',
          columns: ['@email'],
          method,
        });
      }
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertCreateIndex('not-an-object'),
        TypeError,
        'Expected object',
      );
      asserts.assertThrows(() => assertCreateIndex(null), TypeError);
    });

    it('invalid: wrong type discriminator', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'DROP_INDEX',
            index: 'foo',
            table: 'users',
            columns: ['@id'],
          }),
        TypeError,
        "Expected type 'CREATE_INDEX'",
      );
    });

    it('invalid: missing index', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            table: 'users',
            columns: ['@id'],
          }),
        TypeError,
        'index name is required',
      );
    });

    it('invalid: index is not a string', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 123,
            table: 'users',
            columns: ['@id'],
          }),
        TypeError,
        'index must be a string, got number',
      );

      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: [],
            table: 'users',
            columns: ['@id'],
          }),
        TypeError,
        'index must be a string, got object',
      );
    });

    it('invalid: index name with bad chars', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx-bad-name',
            table: 'users',
            columns: ['@id'],
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: missing table', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            columns: ['@id'],
          }),
        TypeError,
        "'table' is required",
      );
    });

    it('invalid: missing columns', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
          }),
        TypeError,
        'columns are required',
      );
    });

    it('invalid: columns not an array', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: '@id',
          }),
        TypeError,
        'columns must be an array',
      );
    });

    it('invalid: empty columns array', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: [],
          }),
        TypeError,
        'at least one column is required',
      );
    });

    it('invalid: column without @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: ['email'],
          }),
        TypeError,
        "must start with '@' prefix",
      );
    });

    it('invalid: non-string column', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: [123],
          }),
        TypeError,
        'must be a string',
      );
    });

    it('invalid: method is not a string', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: ['@id'],
            method: 123,
          }),
        TypeError,
        'method must be a string, got number',
      );
    });

    it('invalid: unknown method', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: ['@id'],
            method: 'NOTAMETHOD',
          }),
        TypeError,
        'method must be one of',
      );
    });

    it('invalid: non-boolean unique', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: ['@id'],
            unique: 'yes',
          }),
        TypeError,
        'unique must be a boolean',
      );
    });

    it('invalid: non-boolean ifNotExists', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: ['@id'],
            ifNotExists: 1,
          }),
        TypeError,
        'ifNotExists must be a boolean',
      );
    });

    it('invalid: where clause is malformed', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: ['@id'],
            where: 'not-a-filter',
          }),
        TypeError,
        "'where' clause is invalid",
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertCreateIndex({
            type: 'CREATE_INDEX',
            index: 'idx_x',
            table: 'users',
            columns: ['@id'],
            bogus: true,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isCreateIndex', () => {
    it('returns true for valid CREATE_INDEX', () => {
      asserts.assertEquals(
        isCreateIndex({
          type: 'CREATE_INDEX',
          index: 'idx_x',
          table: 'users',
          columns: ['@id'],
        }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isCreateIndex({ type: 'CREATE_INDEX' }), false);
      asserts.assertEquals(isCreateIndex(null), false);
      asserts.assertEquals(isCreateIndex('foo'), false);
    });
  });

  describe('assertDropIndex', () => {
    it('valid: minimal', () => {
      assertDropIndex({
        type: 'DROP_INDEX',
        index: 'idx_users_email',
        table: 'users',
      });
    });

    it('valid: with schema, ifExists, cascade', () => {
      assertDropIndex({
        type: 'DROP_INDEX',
        index: 'idx_users_email',
        table: 'users',
        schema: 'public',
        ifExists: true,
        cascade: true,
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertDropIndex(null),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type discriminator', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'CREATE_INDEX',
            index: 'idx',
            table: 'users',
          }),
        TypeError,
        "Expected type 'DROP_INDEX'",
      );
    });

    it('invalid: missing index', () => {
      asserts.assertThrows(
        () => assertDropIndex({ type: 'DROP_INDEX' }),
        TypeError,
        'index name is required',
      );
    });

    it('invalid: index is not a string', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 123,
            table: 'users',
          }),
        TypeError,
        'index must be a string, got number',
      );

      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: {},
            table: 'users',
          }),
        TypeError,
        'index must be a string, got object',
      );
    });

    it('invalid: missing table', () => {
      asserts.assertThrows(
        () => assertDropIndex({ type: 'DROP_INDEX', index: 'idx_x' }),
        TypeError,
        'table name is required',
      );
    });

    it('invalid: table is not a string', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: 123,
          }),
        TypeError,
        'table must be a string, got number',
      );
    });

    it('invalid: table name with bad chars', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: '1bad',
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: schema is not a string', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: 'users',
            schema: 123,
          }),
        TypeError,
        'schema must be a string, got number',
      );

      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: 'users',
            schema: [],
          }),
        TypeError,
        'schema must be a string, got object',
      );
    });

    it('invalid: index name with bad chars', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: '1bad',
            table: 'users',
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: schema with bad chars', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: 'users',
            schema: 'bad-schema',
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: non-boolean ifExists', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: 'users',
            ifExists: 'yes',
          }),
        TypeError,
        'ifExists must be a boolean',
      );
    });

    it('invalid: non-boolean cascade', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: 'users',
            cascade: 1,
          }),
        TypeError,
        'cascade must be a boolean',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertDropIndex({
            type: 'DROP_INDEX',
            index: 'idx_x',
            table: 'users',
            bogus: true,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isDropIndex', () => {
    it('returns true for valid DROP_INDEX', () => {
      asserts.assertEquals(
        isDropIndex({
          type: 'DROP_INDEX',
          index: 'idx_x',
          table: 'users',
        }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isDropIndex({ type: 'DROP_INDEX' }), false);
      asserts.assertEquals(
        isDropIndex({ type: 'DROP_INDEX', index: 'idx_x' }),
        false,
      );
      asserts.assertEquals(isDropIndex(null), false);
    });
  });
});

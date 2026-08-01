/**
 * UPSERT Query Validator Tests
 *
 * Comprehensive test suite for the UPSERT query validator.
 *
 * @module asserts/Query/DML/Upsert
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertUpsertQuery, isUpsertQuery } from './upsert.ts';

describe('oql.asserts.Query.DML.Upsert', () => {
  describe('valid queries', () => {
    it('simple query', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        data: { id: 1, name: 'John', email: 'john@example.com' },
        conflictKeys: ['@id'],
      };
      assertUpsertQuery(query);
    });

    it('with schema', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        conflictKeys: ['@id'],
      };
      assertUpsertQuery(query);
    });

    it('with partial update on conflict', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'email', 'createdAt', 'updatedAt'],
        data: {
          id: 1,
          name: 'John',
          email: 'john@example.com',
          createdAt: { $$_expression: 'NOW' },
          updatedAt: { $$_expression: 'NOW' },
        },
        conflictKeys: ['@id'],
        updateOnConflict: ['@name', '@updatedAt'],
      };
      assertUpsertQuery(query);
    });

    it('with composite key', () => {
      const query = {
        type: 'UPSERT',
        table: 'user_products',
        columns: ['userId', 'productId', 'quantity', 'lastViewed'],
        data: {
          userId: 1,
          productId: 100,
          quantity: 1,
          lastViewed: { $$_expression: 'NOW' },
        },
        conflictKeys: ['@userId', '@productId'],
      };
      assertUpsertQuery(query);
    });

    it('with composite key and updateOnConflict', () => {
      const query = {
        type: 'UPSERT',
        table: 'user_products',
        columns: ['userId', 'productId', 'quantity', 'lastViewed'],
        data: {
          userId: 1,
          productId: 100,
          quantity: 1,
          lastViewed: { $$_expression: 'NOW' },
        },
        conflictKeys: ['@userId', '@productId'],
        updateOnConflict: ['@quantity', '@lastViewed'],
      };
      assertUpsertQuery(query);
    });

    it('bulk insert', () => {
      const query = {
        type: 'UPSERT',
        table: 'settings',
        columns: ['key', 'value'],
        data: [
          { key: 'theme', value: 'dark' },
          { key: 'lang', value: 'en' },
        ],
        conflictKeys: ['@key'],
      };
      assertUpsertQuery(query);
    });

    it('bulk with updateOnConflict', () => {
      const query = {
        type: 'UPSERT',
        table: 'settings',
        columns: ['key', 'value', 'updatedAt'],
        data: [
          { key: 'theme', value: 'dark', updatedAt: { $$_expression: 'NOW' } },
          { key: 'lang', value: 'en', updatedAt: { $$_expression: 'NOW' } },
        ],
        conflictKeys: ['@key'],
        updateOnConflict: ['@value', '@updatedAt'],
      };
      assertUpsertQuery(query);
    });

    it('with expressions', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt', 'updatedAt'],
        data: {
          id: 1,
          name: 'John',
          createdAt: { $$_expression: 'NOW' },
          updatedAt: { $$_expression: 'NOW' },
        },
        conflictKeys: ['@id'],
      };
      assertUpsertQuery(query);
    });

    it('with null values', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { id: 1, name: 'John', bio: null },
        conflictKeys: ['@id'],
      };
      assertUpsertQuery(query);
    });
  });

  describe('invalid type', () => {
    it('null', () => {
      asserts.assertThrows(
        () => assertUpsertQuery(null),
        TypeError,
        'Expected object',
      );
    });

    it('array', () => {
      asserts.assertThrows(
        () => assertUpsertQuery([]),
        TypeError,
        'UPSERT',
      );
    });

    it('wrong type', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id'],
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        "Expected type 'UPSERT'",
      );
    });
  });

  describe('invalid table', () => {
    it('missing table', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            columns: ['id'],
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'table',
      );
    });

    it('empty table', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: '',
            columns: ['id'],
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'non-empty string',
      );
    });

    it('empty schema', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            schema: '',
            columns: ['id'],
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'non-empty string',
      );
    });
  });

  describe('invalid columns', () => {
    it('missing columns', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'columns',
      );
    });

    it('empty columns', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: [],
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'non-empty array',
      );
    });

    it('column with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['@id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id'],
          }),
        TypeError,
        "without '@' prefix",
      );
    });

    it('non-string column element', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 123],
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'non-empty string',
      );
    });

    it('empty column element', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', ''],
            data: { id: 1 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'non-empty string',
      );
    });
  });

  describe('invalid data', () => {
    it('missing data', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            conflictKeys: ['id'],
          }),
        TypeError,
        "data' is required",
      );
    });

    it('null data', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: null,
            conflictKeys: ['id'],
          }),
        TypeError,
        "data' is required",
      );
    });

    it('empty data array', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: [],
            conflictKeys: ['id'],
          }),
        TypeError,
        'cannot be an empty array',
      );
    });

    it('empty data object', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: {},
            conflictKeys: ['id'],
          }),
        TypeError,
        'cannot be empty',
      );
    });

    it('bulk with non-object item', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: [
              { id: 1, name: 'John' },
              null,
            ],
            conflictKeys: ['id'],
          }),
        TypeError,
        'must be an object',
      );
    });

    it('data key with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { '@id': 1, name: 'John' },
            conflictKeys: ['id'],
          }),
        TypeError,
        'is not in columns list',
      );
    });

    it('data key not in columns', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John', age: 30 },
            conflictKeys: ['id'],
          }),
        TypeError,
        'not in columns list',
      );
    });

    it('invalid expression in data', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name', 'createdAt'],
            data: {
              id: 1,
              name: 'John',
              createdAt: { $$_expression: 'INVALID_TYPE' },
            },
            conflictKeys: ['id'],
          }),
        TypeError,
        'invalid expression',
      );
    });
  });

  describe('invalid conflict keys', () => {
    it('missing conflictKeys', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
          }),
        TypeError,
        'conflictKeys',
      );
    });

    it('empty conflictKeys', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: [],
          }),
        TypeError,
        'non-empty array',
      );
    });

    it('conflictKey not in columns', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@email'],
          }),
        TypeError,
        'is not in the provided column list',
      );
    });

    it('conflictKey without @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id'],
          }),
        TypeError,
        "must start with '@'",
      );
    });

    it('non-string conflictKey element', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id', 123],
          }),
        TypeError,
        'Expected string',
      );
    });

    it('empty conflictKey element', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id', ''],
          }),
        TypeError,
        'Segment "" must start',
      );
    });
  });

  describe('invalid update on conflict', () => {
    it('updateOnConflict including conflictKey', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name', 'email'],
            data: { id: 1, name: 'John', email: 'john@example.com' },
            conflictKeys: ['@id'],
            updateOnConflict: ['@id', '@name'],
          }),
        TypeError,
        'should not include conflictKey',
      );
    });

    it('updateOnConflict not an array', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id'],
            updateOnConflict: { name: 'Jane' },
          }),
        TypeError,
        'must be an array',
      );
    });

    it('updateOnConflict key not in columns', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id'],
            updateOnConflict: ['@age'],
          }),
        TypeError,
        'is not in the provided column list',
      );
    });

    it('updateOnConflict column not in data', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name', 'updatedAt'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id'],
            updateOnConflict: ['@updatedAt'],
          }),
        TypeError,
        'must exist in data',
      );
    });

    it('empty updateOnConflict array', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id'],
            updateOnConflict: [],
          }),
        TypeError,
        'cannot be an empty array',
      );
    });

    it('updateOnConflict key without @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id'],
            updateOnConflict: ['name'],
          }),
        TypeError,
        "must start with '@'",
      );
    });
  });

  describe('isUpsertQuery type guard', () => {
    it('should return true for valid UPSERT query', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        conflictKeys: ['@id'],
      };
      asserts.assertEquals(isUpsertQuery(query), true);
    });

    it('should return false for invalid queries', () => {
      asserts.assertEquals(isUpsertQuery(null), false);
      asserts.assertEquals(isUpsertQuery(undefined), false);
      asserts.assertEquals(isUpsertQuery(123), false);
      asserts.assertEquals(isUpsertQuery('UPSERT'), false);
      asserts.assertEquals(isUpsertQuery([]), false);
      asserts.assertEquals(isUpsertQuery({}), false);
      asserts.assertEquals(
        isUpsertQuery({ type: 'INSERT', table: 'users' }),
        false,
      );
    });

    it('should narrow type correctly', () => {
      const query: unknown = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        conflictKeys: ['@id'],
      };

      if (isUpsertQuery(query)) {
        asserts.assertEquals(query.type, 'UPSERT');
        asserts.assertEquals(query.table, 'users');
        asserts.assert(Array.isArray(query.columns));
        asserts.assert(typeof query.data === 'object');
      }
    });
  });
});

/**
 * UPSERT Query Validator Tests
 *
 * Comprehensive test suite for the UPSERT query validator.
 *
 * @module asserts/Query/DML/Upsert
 */

import * as asserts from '$asserts';
import { assertUpsertQuery } from './Upsert.ts';

Deno.test('oql.asserts.Query.DML.Upsert', async (t) => {
  await t.step('valid queries', async (u) => {
    await u.step('simple query', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        data: { id: 1, name: 'John', email: 'john@example.com' },
        conflictKeys: ['id'],
      };
      assertUpsertQuery(query);
    });

    await u.step('with schema', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        conflictKeys: ['id'],
      };
      assertUpsertQuery(query);
    });

    await u.step('with partial update on conflict', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'email', 'createdAt', 'updatedAt'],
        data: {
          id: 1,
          name: 'John',
          email: 'john@example.com',
          createdAt: { type: 'NOW' },
          updatedAt: { type: 'NOW' },
        },
        conflictKeys: ['id'],
        updateOnConflict: {
          name: 'John',
          updatedAt: { type: 'NOW' },
        },
      };
      assertUpsertQuery(query);
    });

    await u.step('with composite key', () => {
      const query = {
        type: 'UPSERT',
        table: 'user_products',
        columns: ['userId', 'productId', 'quantity', 'lastViewed'],
        data: {
          userId: 1,
          productId: 100,
          quantity: 1,
          lastViewed: { type: 'NOW' },
        },
        conflictKeys: ['userId', 'productId'],
      };
      assertUpsertQuery(query);
    });

    await u.step('with composite key and updateOnConflict', () => {
      const query = {
        type: 'UPSERT',
        table: 'user_products',
        columns: ['userId', 'productId', 'quantity', 'lastViewed'],
        data: {
          userId: 1,
          productId: 100,
          quantity: 1,
          lastViewed: { type: 'NOW' },
        },
        conflictKeys: ['userId', 'productId'],
        updateOnConflict: {
          quantity: { type: 'ADD', args: ['@quantity', 1] },
          lastViewed: { type: 'NOW' },
        },
      };
      assertUpsertQuery(query);
    });

    await u.step('bulk insert', () => {
      const query = {
        type: 'UPSERT',
        table: 'settings',
        columns: ['key', 'value'],
        data: [
          { key: 'theme', value: 'dark' },
          { key: 'lang', value: 'en' },
        ],
        conflictKeys: ['key'],
      };
      assertUpsertQuery(query);
    });

    await u.step('bulk with updateOnConflict', () => {
      const query = {
        type: 'UPSERT',
        table: 'settings',
        columns: ['key', 'value', 'updatedAt'],
        data: [
          { key: 'theme', value: 'dark', updatedAt: { type: 'NOW' } },
          { key: 'lang', value: 'en', updatedAt: { type: 'NOW' } },
        ],
        conflictKeys: ['key'],
        updateOnConflict: {
          value: 'updated',
          updatedAt: { type: 'NOW' },
        },
      };
      assertUpsertQuery(query);
    });

    await u.step('with expressions', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt', 'updatedAt'],
        data: {
          id: 1,
          name: 'John',
          createdAt: { type: 'NOW' },
          updatedAt: { type: 'NOW' },
        },
        conflictKeys: ['id'],
      };
      assertUpsertQuery(query);
    });

    await u.step('with null values', () => {
      const query = {
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { id: 1, name: 'John', bio: null },
        conflictKeys: ['id'],
      };
      assertUpsertQuery(query);
    });
  });

  await t.step('invalid type', async (u) => {
    await u.step('null', () => {
      asserts.assertThrows(
        () => assertUpsertQuery(null),
        TypeError,
        'Expected object',
      );
    });

    await u.step('array', () => {
      asserts.assertThrows(
        () => assertUpsertQuery([]),
        TypeError,
        'UPSERT',
      );
    });

    await u.step('wrong type', () => {
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

  await t.step('invalid table', async (u) => {
    await u.step('missing table', () => {
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

    await u.step('empty table', () => {
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

    await u.step('empty schema', () => {
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

  await t.step('invalid columns', async (u) => {
    await u.step('missing columns', () => {
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

    await u.step('empty columns', () => {
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

    await u.step('column with @ prefix', () => {
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

    await u.step('non-string column element', () => {
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

    await u.step('empty column element', () => {
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

  await t.step('invalid data', async (u) => {
    await u.step('missing data', () => {
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

    await u.step('null data', () => {
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

    await u.step('empty data array', () => {
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

    await u.step('empty data object', () => {
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

    await u.step('bulk with non-object item', () => {
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

    await u.step('data key with @ prefix', () => {
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
        "should not have '@' prefix",
      );
    });

    await u.step('data key not in columns', () => {
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

    await u.step('invalid expression in data', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name', 'createdAt'],
            data: {
              id: 1,
              name: 'John',
              createdAt: { type: 'INVALID_TYPE' },
            },
            conflictKeys: ['id'],
          }),
        TypeError,
        'invalid expression',
      );
    });
  });

  await t.step('invalid conflict keys', async (u) => {
    await u.step('missing conflictKeys', () => {
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

    await u.step('empty conflictKeys', () => {
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

    await u.step('conflictKey not in columns', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['email'],
          }),
        TypeError,
        'not in columns list',
      );
    });

    await u.step('conflictKey with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['@id'],
          }),
        TypeError,
        "without '@' prefix",
      );
    });

    await u.step('non-string conflictKey element', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id', 123],
          }),
        TypeError,
        'non-empty string',
      );
    });

    await u.step('empty conflictKey element', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id', ''],
          }),
        TypeError,
        'non-empty string',
      );
    });
  });

  await t.step('invalid update on conflict', async (u) => {
    await u.step('updateOnConflict including conflictKey', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name', 'email'],
            data: { id: 1, name: 'John', email: 'john@example.com' },
            conflictKeys: ['id'],
            updateOnConflict: { id: 2, name: 'Jane' },
          }),
        TypeError,
        'should not include conflictKey',
      );
    });

    await u.step('updateOnConflict as array', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id'],
            updateOnConflict: [{ name: 'Jane' }],
          }),
        TypeError,
        'not an array',
      );
    });

    await u.step('updateOnConflict key not in columns', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id'],
            updateOnConflict: { age: 30 },
          }),
        TypeError,
        'not in columns list',
      );
    });

    await u.step('invalid expression in updateOnConflict', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name', 'updatedAt'],
            data: { id: 1, name: 'John', updatedAt: { type: 'NOW' } },
            conflictKeys: ['id'],
            updateOnConflict: {
              updatedAt: { type: 'INVALID_TYPE' },
            },
          }),
        TypeError,
        'invalid expression',
      );
    });

    await u.step('empty updateOnConflict object', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id'],
            updateOnConflict: {},
          }),
        TypeError,
        'cannot be empty',
      );
    });

    await u.step('updateOnConflict key with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpsertQuery({
            type: 'UPSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John' },
            conflictKeys: ['id'],
            updateOnConflict: { '@name': 'Jane' },
          }),
        TypeError,
        "should not have '@' prefix",
      );
    });
  });
});

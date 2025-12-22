/**
 * INSERT Query Validator Tests
 *
 * Comprehensive test suite for INSERT query validator.
 *
 * @module asserts/Query/DML/Insert.test
 */

import * as asserts from '$asserts';
import { assertInsertQuery } from './Insert.ts';

Deno.test('oql.asserts.Query.DML.Insert', async (t) => {
  await t.step('valid queries', async (u) => {
    await u.step('simple query', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        data: { id: 1, name: 'John Doe', email: 'john@example.com' },
      };
      assertInsertQuery(query);
    });

    await u.step('with schema', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
      };
      assertInsertQuery(query);
    });

    await u.step('with expression', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        data: {
          id: 1,
          name: 'John',
          createdAt: { type: 'NOW' },
        },
      };
      assertInsertQuery(query);
    });

    await u.step('with multiple expressions', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt', 'updatedAt'],
        data: {
          id: 1,
          name: 'John',
          createdAt: { type: 'NOW' },
          updatedAt: { type: 'NOW' },
        },
      };
      assertInsertQuery(query);
    });

    await u.step('with null value', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { id: 1, name: 'John', bio: null },
      };
      assertInsertQuery(query);
    });

    await u.step('with undefined value', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { id: 1, name: 'John', bio: undefined },
      };
      assertInsertQuery(query);
    });

    await u.step('with Date value', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'birthDate'],
        data: { id: 1, name: 'John', birthDate: '1990-01-01' },
      };
      assertInsertQuery(query);
    });

    await u.step('bulk insert (array)', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
      };
      assertInsertQuery(query);
    });

    await u.step('bulk with expressions', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        data: [
          { id: 1, name: 'John', createdAt: { type: 'NOW' } },
          { id: 2, name: 'Jane', createdAt: { type: 'NOW' } },
        ],
      };
      assertInsertQuery(query);
    });

    await u.step('with all data types', () => {
      const query = {
        type: 'INSERT',
        table: 'test_data',
        columns: ['id', 'name', 'age', 'active', 'createdAt'],
        data: {
          id: 1,
          name: 'Test',
          age: 25,
          active: true,
          createdAt: { type: 'NOW' },
        },
      };
      assertInsertQuery(query);
    });
  });

  await t.step('invalid type', async (u) => {
    await u.step('null', () => {
      asserts.assertThrows(
        () => assertInsertQuery(null),
        TypeError,
        'Expected object',
      );
    });

    await u.step('non-object', () => {
      asserts.assertThrows(
        () => assertInsertQuery('not an object'),
        TypeError,
        'Expected object',
      );
    });

    await u.step('wrong type', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        "Expected type 'INSERT'",
      );
    });
  });

  await t.step('invalid table', async (u) => {
    await u.step('missing table', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        'table',
      );
    });

    await u.step('empty table', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: '',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty string',
      );
    });
  });

  await t.step('invalid schema', async (u) => {
    await u.step('empty schema', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            schema: '',
            columns: ['id'],
            data: { id: 1 },
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
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            data: { id: 1 },
          }),
        TypeError,
        'columns',
      );
    });

    await u.step('empty columns array', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: [],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty array',
      );
    });

    await u.step('column with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['@id', 'name'],
            data: { id: 1, name: 'John' },
          }),
        TypeError,
        "without '@' prefix",
      );
    });

    await u.step('non-string column element', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 123],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty string',
      );
    });

    await u.step('empty column element', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', ''],
            data: { id: 1 },
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
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
          }),
        TypeError,
        "data' is required",
      );
    });

    await u.step('null data', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: null,
          }),
        TypeError,
        "data' is required",
      );
    });

    await u.step('empty data array', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: [],
          }),
        TypeError,
        'cannot be an empty array',
      );
    });

    await u.step('non-object data', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id'],
            data: 'not an object',
          }),
        TypeError,
        'must be an object',
      );
    });

    await u.step('empty data object', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: {},
          }),
        TypeError,
        'cannot be empty',
      );
    });

    await u.step('data key not in columns', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John', age: 30 },
          }),
        TypeError,
        'not in columns list',
      );
    });

    await u.step('data key with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { '@id': 1, name: 'John' },
          }),
        TypeError,
        'is not in columns list',
      );
    });

    await u.step('data value type', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name', 'data'],
            data: { id: 1, name: 'John', data: { nested: 'object' } },
          }),
        TypeError,
        'invalid expression',
      );
    });

    await u.step('bulk insert with invalid item', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: [
              { id: 1, name: 'John' },
              null,
            ],
          }),
        TypeError,
        'must be an object',
      );
    });
  });

  await t.step('invalid expressions', async (u) => {
    await u.step('expression with column reference', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['firstName', 'lastName', 'fullName'],
            data: {
              firstName: 'John',
              lastName: 'Doe',
              fullName: {
                type: 'CONCAT',
                args: ['@firstName', ' ', '@lastName'],
              },
            },
          }),
        TypeError,
        'Column references',
      );
    });

    await u.step('invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name', 'createdAt'],
            data: {
              id: 1,
              name: 'John',
              createdAt: { type: 'INVALID_TYPE' },
            },
          }),
        TypeError,
        'invalid expression',
      );
    });
  });
});

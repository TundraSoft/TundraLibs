/**
 * UPSERT Query Validator Tests
 *
 * Comprehensive test suite for the UPSERT query validator.
 *
 * @module asserts/Query/DML/Upsert
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertUpsertQuery } from './Upsert.ts';

Deno.test('UPSERT - valid simple query', () => {
  const query = {
    type: 'UPSERT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    data: { id: 1, name: 'John', email: 'john@example.com' },
    conflictKeys: ['id'],
  };
  assertUpsertQuery(query);
});

Deno.test('UPSERT - valid with schema', () => {
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

Deno.test('UPSERT - valid with partial update on conflict', () => {
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

Deno.test('UPSERT - valid with composite key', () => {
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

Deno.test('UPSERT - valid with composite key and updateOnConflict', () => {
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

Deno.test('UPSERT - valid bulk insert', () => {
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

Deno.test('UPSERT - valid bulk with updateOnConflict', () => {
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

Deno.test('UPSERT - valid with expressions', () => {
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

Deno.test('UPSERT - valid with returnColumns', () => {
  const query = {
    type: 'UPSERT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    data: { id: 1, name: 'John', email: 'john@example.com' },
    conflictKeys: ['id'],
    returnColumns: ['id', 'email'],
  };
  assertUpsertQuery(query);
});

Deno.test('UPSERT - valid with null values', () => {
  const query = {
    type: 'UPSERT',
    table: 'users',
    columns: ['id', 'name', 'bio'],
    data: { id: 1, name: 'John', bio: null },
    conflictKeys: ['id'],
  };
  assertUpsertQuery(query);
});

// Invalid query tests

Deno.test('UPSERT - throws on null', () => {
  assertThrows(
    () => assertUpsertQuery(null),
    TypeError,
    'Expected object',
  );
});

Deno.test('UPSERT - throws on array', () => {
  assertThrows(
    () => assertUpsertQuery([]),
    TypeError,
    'UPSERT',
  );
});

Deno.test('UPSERT - throws on wrong type', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on missing table', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty table', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty schema', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on missing columns', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty columns', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on column with @ prefix', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on missing data', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on null data', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty data array', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on missing conflictKeys', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty conflictKeys', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on conflictKey not in columns', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on conflictKey with @ prefix', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on data key with @ prefix', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on data key not in columns', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on updateOnConflict including conflictKey', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on updateOnConflict as array', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on updateOnConflict key not in columns', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on invalid expression in data', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on invalid expression in updateOnConflict', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty data object', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on bulk with non-object item', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on invalid returnColumns type', () => {
  assertThrows(
    () =>
      assertUpsertQuery({
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        conflictKeys: ['id'],
        returnColumns: 'id',
      }),
    TypeError,
    'array',
  );
});

Deno.test('UPSERT - throws on non-string column element', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty column element', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on non-string conflictKey element', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty conflictKey element', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on empty returnColumns element', () => {
  assertThrows(
    () =>
      assertUpsertQuery({
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        conflictKeys: ['id'],
        returnColumns: ['id', ''],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('UPSERT - throws on non-string returnColumns element', () => {
  assertThrows(
    () =>
      assertUpsertQuery({
        type: 'UPSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        conflictKeys: ['id'],
        returnColumns: ['id', 123],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('UPSERT - throws on empty updateOnConflict object', () => {
  assertThrows(
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

Deno.test('UPSERT - throws on updateOnConflict key with @ prefix', () => {
  assertThrows(
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

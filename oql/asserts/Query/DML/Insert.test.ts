/**
 * INSERT Query Validator Tests
 *
 * Comprehensive test suite for the INSERT query validator.
 *
 * @module asserts/Query/DML/Insert
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertInsertQuery } from './Insert.ts';

Deno.test('INSERT - valid simple query', () => {
  const query = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    data: { id: 1, name: 'John Doe', email: 'john@example.com' },
  };
  assertInsertQuery(query);
});

Deno.test('INSERT - valid with schema', () => {
  const query = {
    type: 'INSERT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'name'],
    data: { id: 1, name: 'John' },
  };
  assertInsertQuery(query);
});

Deno.test('INSERT - valid with expression', () => {
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

Deno.test('INSERT - valid with multiple expressions', () => {
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

Deno.test('INSERT - valid with null value', () => {
  const query = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'bio'],
    data: { id: 1, name: 'John', bio: null },
  };
  assertInsertQuery(query);
});

Deno.test('INSERT - valid with undefined value', () => {
  const query = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'bio'],
    data: { id: 1, name: 'John', bio: undefined },
  };
  assertInsertQuery(query);
});

Deno.test('INSERT - valid with Date value', () => {
  const query = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'birthDate'],
    data: { id: 1, name: 'John', birthDate: '1990-01-01' },
  };
  assertInsertQuery(query);
});

Deno.test('INSERT - valid bulk insert (array)', () => {
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

Deno.test('INSERT - valid bulk with expressions', () => {
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

Deno.test('INSERT - valid with returnColumns', () => {
  const query = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'email', 'createdAt'],
    data: {
      id: 1,
      name: 'John',
      email: 'john@example.com',
      createdAt: { type: 'NOW' },
    },
    returnColumns: ['id', 'createdAt'],
  };
  assertInsertQuery(query);
});

Deno.test('INSERT - valid with all data types', () => {
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

// Invalid query tests

Deno.test('INSERT - throws on null', () => {
  assertThrows(
    () => assertInsertQuery(null),
    TypeError,
    'Expected object',
  );
});

Deno.test('INSERT - throws on non-object', () => {
  assertThrows(
    () => assertInsertQuery('not an object'),
    TypeError,
    'Expected object',
  );
});

Deno.test('INSERT - throws on wrong type', () => {
  assertThrows(
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

Deno.test('INSERT - throws on missing table', () => {
  assertThrows(
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

Deno.test('INSERT - throws on empty table', () => {
  assertThrows(
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

Deno.test('INSERT - throws on empty schema', () => {
  assertThrows(
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

Deno.test('INSERT - throws on missing columns', () => {
  assertThrows(
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

Deno.test('INSERT - throws on empty columns array', () => {
  assertThrows(
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

Deno.test('INSERT - throws on column with @ prefix', () => {
  assertThrows(
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

Deno.test('INSERT - throws on missing data', () => {
  assertThrows(
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

Deno.test('INSERT - throws on null data', () => {
  assertThrows(
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

Deno.test('INSERT - throws on empty data array', () => {
  assertThrows(
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

Deno.test('INSERT - throws on non-object data', () => {
  assertThrows(
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

Deno.test('INSERT - throws on empty data object', () => {
  assertThrows(
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

Deno.test('INSERT - throws on data key not in columns', () => {
  assertThrows(
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

Deno.test('INSERT - throws on data key with @ prefix', () => {
  assertThrows(
    () =>
      assertInsertQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { '@id': 1, name: 'John' },
      }),
    TypeError,
    "should not have '@' prefix",
  );
});

Deno.test('INSERT - throws on invalid data value type', () => {
  assertThrows(
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

Deno.test('INSERT - throws on invalid expression', () => {
  assertThrows(
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

Deno.test('INSERT - throws on invalid returnColumns type', () => {
  assertThrows(
    () =>
      assertInsertQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        returnColumns: 'id',
      }),
    TypeError,
    'array',
  );
});

Deno.test('INSERT - throws on empty returnColumns element', () => {
  assertThrows(
    () =>
      assertInsertQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        returnColumns: ['id', ''],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('INSERT - throws on bulk insert with invalid item', () => {
  assertThrows(
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
Deno.test('INSERT - throws on non-string column element', () => {
  assertThrows(
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

Deno.test('INSERT - throws on empty column element', () => {
  assertThrows(
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

Deno.test('INSERT - throws on non-string returnColumns element', () => {
  assertThrows(
    () =>
      assertInsertQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
        returnColumns: ['id', 123],
      }),
    TypeError,
    'non-empty string',
  );
});
/**
 * UPDATE Query Validator Tests
 *
 * Comprehensive test suite for the UPDATE query validator.
 *
 * @module asserts/Query/DML/Update
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertUpdateQuery } from './Update.ts';

Deno.test('UPDATE - valid simple query', () => {
  const query = {
    type: 'UPDATE',
    table: 'users',
    columns: ['id', 'name', 'email'],
    data: { email: 'newemail@example.com' },
    where: { '@id': 1 },
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid with schema', () => {
  const query = {
    type: 'UPDATE',
    table: 'users',
    schema: 'public',
    columns: ['id', 'name'],
    data: { name: 'Jane' },
    where: { '@id': 1 },
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid with expression', () => {
  const query = {
    type: 'UPDATE',
    table: 'users',
    columns: ['id', 'name', 'updatedAt'],
    data: {
      name: 'Jane Doe',
      updatedAt: { type: 'NOW' },
    },
    where: { '@id': 1 },
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid with multiple expressions', () => {
  const query = {
    type: 'UPDATE',
    table: 'products',
    columns: ['id', 'price', 'discount', 'updatedAt'],
    data: {
      price: { type: 'MULTIPLY', args: ['@price', 0.9] },
      updatedAt: { type: 'NOW' },
    },
    where: { '@id': 1 },
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid without WHERE (update all)', () => {
  const query = {
    type: 'UPDATE',
    table: 'settings',
    columns: ['key', 'value', 'lastSync'],
    data: { lastSync: { type: 'NOW' } },
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid with complex WHERE', () => {
  const query = {
    type: 'UPDATE',
    table: 'users',
    columns: ['id', 'status', 'lastLogin'],
    data: { status: 'inactive' },
    where: {
      '@status': 'active',
      '@lastLogin': { $lt: new Date('2023-01-01') },
    },
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid with returnColumns', () => {
  const query = {
    type: 'UPDATE',
    table: 'products',
    columns: ['id', 'price', 'discount', 'updatedAt'],
    data: {
      price: { type: 'MULTIPLY', args: ['@price', 0.9] },
      updatedAt: { type: 'NOW' },
    },
    where: { '@discount': true },
    returnColumns: ['id', 'price'],
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid with null value', () => {
  const query = {
    type: 'UPDATE',
    table: 'users',
    columns: ['id', 'name', 'bio'],
    data: { bio: null },
    where: { '@id': 1 },
  };
  assertUpdateQuery(query);
});

Deno.test('UPDATE - valid with all data types', () => {
  const query = {
    type: 'UPDATE',
    table: 'test_data',
    columns: ['id', 'name', 'age', 'active', 'updatedAt'],
    data: {
      name: 'Test',
      age: 26,
      active: false,
      updatedAt: { type: 'NOW' },
    },
    where: { '@id': 1 },
  };
  assertUpdateQuery(query);
});

// Invalid query tests

Deno.test('UPDATE - throws on null', () => {
  assertThrows(
    () => assertUpdateQuery(null),
    TypeError,
    'Expected object',
  );
});

Deno.test('UPDATE - throws on non-object', () => {
  assertThrows(
    () => assertUpdateQuery(123),
    TypeError,
    'Expected object',
  );
});

Deno.test('UPDATE - throws on wrong type', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['id'],
        data: { id: 1 },
      }),
    TypeError,
    "Expected type 'UPDATE'",
  );
});

Deno.test('UPDATE - throws on missing table', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        columns: ['id'],
        data: { id: 1 },
      }),
    TypeError,
    'table',
  );
});

Deno.test('UPDATE - throws on empty table', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: '',
        columns: ['id'],
        data: { id: 1 },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('UPDATE - throws on empty schema', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        schema: '',
        columns: ['id'],
        data: { id: 1 },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('UPDATE - throws on missing columns', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        data: { name: 'John' },
      }),
    TypeError,
    'columns',
  );
});

Deno.test('UPDATE - throws on empty columns array', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: [],
        data: { name: 'John' },
      }),
    TypeError,
    'non-empty array',
  );
});

Deno.test('UPDATE - throws on column with @ prefix', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['@id', 'name'],
        data: { name: 'John' },
      }),
    TypeError,
    "without '@' prefix",
  );
});

Deno.test('UPDATE - throws on missing data', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        where: { '@id': 1 },
      }),
    TypeError,
    'must be a non-null object',
  );
});

Deno.test('UPDATE - throws on null data', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: null,
        where: { '@id': 1 },
      }),
    TypeError,
    'must be a non-null object',
  );
});

Deno.test('UPDATE - throws on empty data object', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: {},
        where: { '@id': 1 },
      }),
    TypeError,
    'at least one property',
  );
});

Deno.test('UPDATE - throws on data as array', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: [{ name: 'John' }],
      }),
    TypeError,
    'not an array',
  );
});

Deno.test('UPDATE - throws on data key with @ prefix', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: { '@name': 'John' },
        where: { '@id': 1 },
      }),
    TypeError,
    "should not have '@' prefix",
  );
});

Deno.test('UPDATE - throws on data key not in columns', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: { name: 'John', age: 30 },
        where: { '@id': 1 },
      }),
    TypeError,
    'not in columns list',
  );
});

Deno.test('UPDATE - throws on invalid expression', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name', 'updatedAt'],
        data: {
          name: 'John',
          updatedAt: { type: 'INVALID_TYPE' },
        },
        where: { '@id': 1 },
      }),
    TypeError,
    'invalid expression',
  );
});

Deno.test('UPDATE - throws on invalid returnColumns type', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: { name: 'John' },
        where: { '@id': 1 },
        returnColumns: 'id',
      }),
    TypeError,
    'array',
  );
});

Deno.test('UPDATE - throws on empty returnColumns element', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: { name: 'John' },
        where: { '@id': 1 },
        returnColumns: ['id', ''],
      }),
    TypeError,
    'non-empty string',
  );
});
Deno.test('UPDATE - throws on non-string column element', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 123],
        data: { id: 1 },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('UPDATE - throws on empty column element', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', ''],
        data: { id: 1 },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('UPDATE - throws on non-string returnColumns element', () => {
  assertThrows(
    () =>
      assertUpdateQuery({
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: { name: 'Jane' },
        returnColumns: ['id', 123],
      }),
    TypeError,
    'non-empty string',
  );
});
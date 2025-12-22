/**
 * DELETE Query Validator Tests
 *
 * Comprehensive test suite for the DELETE query validator.
 *
 * @module asserts/Query/DML/Delete
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertDeleteQuery } from './Delete.ts';

Deno.test('DELETE - valid simple query', () => {
  const query = {
    type: 'DELETE',
    table: 'users',
    columns: ['id', 'status'],
    where: { '@status': 'inactive' },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid with schema', () => {
  const query = {
    type: 'DELETE',
    table: 'users',
    schema: 'public',
    columns: ['id', 'status'],
    where: { '@status': 'inactive' },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid with complex WHERE', () => {
  const query = {
    type: 'DELETE',
    table: 'logs',
    columns: ['id', 'createdAt', 'level'],
    where: {
      '@level': 'debug',
      '@createdAt': { $lt: new Date('2023-01-01') },
    },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid without WHERE (delete all)', () => {
  const query = {
    type: 'DELETE',
    table: 'temp_data',
    columns: ['id', 'data'],
  };
  assertDeleteQuery(query);
});


Deno.test('DELETE - valid with date comparison', () => {
  const query = {
    type: 'DELETE',
    table: 'users',
    schema: 'archive',
    columns: ['id', 'deletedAt'],
    where: { '@deletedAt': { $lt: new Date('2023-01-01') } },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid with IN operator', () => {
  const query = {
    type: 'DELETE',
    table: 'users',
    columns: ['id', 'status'],
    where: { '@status': { $in: ['deleted', 'banned'] } },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid with NULL operator', () => {
  const query = {
    type: 'DELETE',
    table: 'users',
    columns: ['id', 'lastLogin'],
    where: { '@lastLogin': { $null: true } },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid with pre-declared expression', () => {
  const query = {
    type: 'DELETE',
    table: 'logs',
    columns: ['id', 'createdAt', 'level', 'size'],
    expressions: {
      'doubleSize': { type: 'MULTIPLY', args: ['@size', 2] },
    },
    where: {
      $and: [
        { '@level': 'debug' },
        { '@doubleSize': { $gte: 1000 } },
      ],
    },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid with multiple expressions', () => {
  const query = {
    type: 'DELETE',
    table: 'temp_data',
    columns: ['id', 'createdAt', 'accessCount', 'size'],
    expressions: {
      'totalSize': { type: 'ADD', args: ['@size', '@accessCount'] },
      'doubleAccess': { type: 'MULTIPLY', args: ['@accessCount', 2] },
    },
    where: {
      '@totalSize': { $gte: 1000 },
      '@accessCount': { $eq: 0 },
    },
  };
  assertDeleteQuery(query);
});

Deno.test('DELETE - valid with expression in complex WHERE', () => {
  const query = {
    type: 'DELETE',
    table: 'products',
    columns: ['id', 'price', 'tax', 'inStock'],
    expressions: {
      'totalCost': { type: 'ADD', args: ['@price', '@tax'] },
    },
    where: {
      $and: [
        { '@totalCost': { $lte: 10 } },
        { '@inStock': false },
      ],
    },
  };
  assertDeleteQuery(query);
});

// Invalid query tests

Deno.test('DELETE - throws on null', () => {
  assertThrows(
    () => assertDeleteQuery(null),
    TypeError,
    'Expected object',
  );
});

Deno.test('DELETE - throws on undefined', () => {
  assertThrows(
    () => assertDeleteQuery(undefined),
    TypeError,
    'Expected object',
  );
});

Deno.test('DELETE - throws on wrong type', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
      }),
    TypeError,
    "Expected type 'DELETE'",
  );
});

Deno.test('DELETE - throws on missing type', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        table: 'users',
        columns: ['id'],
      }),
    TypeError,
    'DELETE',
  );
});

Deno.test('DELETE - throws on missing table', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        columns: ['id'],
      }),
    TypeError,
    'table',
  );
});

Deno.test('DELETE - throws on empty table', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        table: '',
        columns: ['id'],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('DELETE - throws on empty schema', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        table: 'users',
        schema: '',
        columns: ['id'],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('DELETE - throws on missing columns', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        table: 'users',
      }),
    TypeError,
    'columns',
  );
});

Deno.test('DELETE - throws on empty columns', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        table: 'users',
        columns: [],
      }),
    TypeError,
    'non-empty array',
  );
});

Deno.test('DELETE - throws on column with @ prefix', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        table: 'users',
        columns: ['@id', 'status'],
      }),
    TypeError,
    "without '@' prefix",
  );
});

Deno.test('DELETE - throws on empty column string', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        table: 'users',
        columns: ['id', ''],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('DELETE - throws on non-array columns', () => {
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'DELETE',
        table: 'users',
        columns: 'id',
      }),
    TypeError,
    'non-empty array',
  );
});








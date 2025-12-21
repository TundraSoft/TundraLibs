/**
 * COUNT Query Validator Tests
 *
 * Comprehensive test suite for the COUNT query validator.
 *
 * @module asserts/Query/DML/Count
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertCountQuery } from './Count.ts';

Deno.test('COUNT - valid simple query', () => {
  const query = {
    type: 'COUNT',
    table: 'users',
    columns: ['id', 'status'],
  };
  assertCountQuery(query);
});

Deno.test('COUNT - valid with schema', () => {
  const query = {
    type: 'COUNT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'status'],
  };
  assertCountQuery(query);
});

Deno.test('COUNT - valid with WHERE', () => {
  const query = {
    type: 'COUNT',
    table: 'users',
    columns: ['id', 'status', 'createdAt'],
    where: { '@status': 'active' },
  };
  assertCountQuery(query);
});

Deno.test('COUNT - valid with complex WHERE', () => {
  const query = {
    type: 'COUNT',
    table: 'users',
    columns: ['id', 'status', 'createdAt'],
    where: {
      '@status': 'active',
      '@createdAt': { $gte: new Date('2024-01-01') },
    },
  };
  assertCountQuery(query);
});



Deno.test('COUNT - valid with IN operator', () => {
  const query = {
    type: 'COUNT',
    table: 'products',
    columns: ['id', 'price', 'category', 'inStock'],
    where: {
      '@category': { $in: ['electronics', 'computers'] },
      '@inStock': true,
    },
  };
  assertCountQuery(query);
});

Deno.test('COUNT - valid with comparison operators', () => {
  const query = {
    type: 'COUNT',
    table: 'products',
    columns: ['id', 'price', 'inStock'],
    where: {
      '@price': { $lte: 1000, $gte: 100 },
      '@inStock': true,
    },
  };
  assertCountQuery(query);
});

Deno.test('COUNT - valid with NULL check', () => {
  const query = {
    type: 'COUNT',
    table: 'users',
    columns: ['id', 'deletedAt'],
    where: { '@deletedAt': { $null: false } },
  };
  assertCountQuery(query);
});

// Invalid query tests

Deno.test('COUNT - throws on null', () => {
  assertThrows(
    () => assertCountQuery(null),
    TypeError,
    'Expected object',
  );
});

Deno.test('COUNT - throws on boolean', () => {
  assertThrows(
    () => assertCountQuery(true),
    TypeError,
    'Expected object',
  );
});

Deno.test('COUNT - throws on wrong type', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
      }),
    TypeError,
    "Expected type 'COUNT'",
  );
});

Deno.test('COUNT - throws on missing table', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        columns: ['id'],
      }),
    TypeError,
    'table',
  );
});

Deno.test('COUNT - throws on empty table', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: '',
        columns: ['id'],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('COUNT - throws on empty schema', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        schema: '',
        columns: ['id'],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('COUNT - throws on missing columns', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
      }),
    TypeError,
    'columns',
  );
});

Deno.test('COUNT - throws on empty columns', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: [],
      }),
    TypeError,
    'non-empty array',
  );
});

Deno.test('COUNT - throws on column with @ prefix', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: ['@id', '@name'],
      }),
    TypeError,
    "without '@' prefix",
  );
});

Deno.test('COUNT - throws on empty column string', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: ['id', ''],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('COUNT - throws on non-string column', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: ['id', 123],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('COUNT - throws on non-array columns', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: 'id',
      }),
    TypeError,
    'non-empty array',
  );
});



Deno.test('COUNT - throws on invalid WHERE structure', () => {
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'status'],
        where: 'status = active',
      }),
    TypeError,
  );
});

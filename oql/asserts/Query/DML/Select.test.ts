/**
 * SELECT Query Validator Tests
 *
 * Comprehensive test suite for the SELECT query validator.
 * Tests cover valid queries, invalid queries, edge cases, and error messages.
 *
 * @module asserts/Query/DML/Select
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertSelectQuery } from './Select.ts';

Deno.test('SELECT - valid simple query', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: { userId: '@id', userName: '@name' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with schema', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'name'],
    projection: { id: '@id' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with WHERE clause', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'status'],
    projection: { id: '@id', name: '@name' },
    where: { '@status': 'active' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with complex WHERE', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'age', 'status'],
    projection: { id: '@id' },
    where: {
      '@status': 'active',
      '@age': { $gte: 18 },
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with LEFT JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'Profile.bio'],
    projection: { id: '@id', name: '@name', bio: '@Profile.@bio' },
    joins: {
      Profile: {
        table: 'profiles',
        type: 'LEFT',
        on: { '@Profile.@userId': '@id' },
        columns: ['userId', 'bio'],
      },
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with INNER JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['id', 'userId', 'User.name'],
    projection: { orderId: '@id', userName: '@User.@name' },
    joins: {
      User: {
        table: 'users',
        type: 'INNER',
        on: { '@User.@id': '@userId' },
        columns: ['id', 'name'],
      },
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with RIGHT JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'Order.total'],
    projection: { userId: '@id', total: '@Order.@total' },
    joins: {
      Order: {
        table: 'orders',
        type: 'RIGHT',
        on: { '@Order.@userId': '@id' },
        columns: ['userId', 'total'],
      },
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with FULL JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'Log.action'],
    projection: { userId: '@id', action: '@Log.@action' },
    joins: {
      Log: {
        table: 'logs',
        type: 'FULL',
        on: { '@Log.@userId': '@id' },
        columns: ['userId', 'action'],
      },
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with CROSS JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'products',
    columns: ['id', 'Category.name'],
    projection: { productId: '@id', category: '@Category.@name' },
    joins: {
      Category: {
        table: 'categories',
        type: 'CROSS',
        columns: ['id', 'name'],
      },
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with aggregates', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['userId', 'total'],
    projection: {
      userId: '@userId',
      totalSpent: { type: 'SUM', column: '@total' },
      orderCount: { type: 'COUNT', column: '@userId' },
    },
    groupBy: ['@userId'],
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with groupBy and having', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['userId', 'total'],
    projection: {
      userId: '@userId',
      totalSpent: { type: 'SUM', column: '@total' },
    },
    groupBy: ['@userId'],
    having: { '@total': { $gt: 1000 } },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with orderBy ASC', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'createdAt'],
    projection: { id: '@id', name: '@name' },
    orderBy: { '@createdAt': 'ASC' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with orderBy DESC', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'createdAt'],
    projection: { id: '@id' },
    orderBy: { '@createdAt': 'DESC' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with multiple orderBy', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'createdAt'],
    projection: { id: '@id' },
    orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with limit', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { id: '@id' },
    limit: 10,
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with offset', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { id: '@id' },
    offset: 20,
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with limit and offset', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { id: '@id' },
    limit: 10,
    offset: 20,
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with distinct', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { id: '@id' },
    distinct: true,
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with returnColumns', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: { id: '@id', name: '@name' },
    returnColumns: ['id', 'name'],
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with all options', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'name', 'email', 'status', 'createdAt'],
    projection: { id: '@id', name: '@name', email: '@email' },
    where: { '@status': 'active' },
    orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
    limit: 100,
    offset: 0,
    distinct: true,
    returnColumns: ['id', 'name'],
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with expression in projection', () => {
  const query = {
    type: 'SELECT',
    table: 'products',
    columns: ['id', 'price', 'tax'],
    projection: {
      id: '@id',
      total: { type: 'ADD', args: ['@price', '@tax'] },
    },
  };
  assertSelectQuery(query);
});

// Invalid query tests

Deno.test('SELECT - throws on null', () => {
  assertThrows(
    () => assertSelectQuery(null),
    TypeError,
    'Expected object',
  );
});

Deno.test('SELECT - throws on non-object', () => {
  assertThrows(
    () => assertSelectQuery('not an object'),
    TypeError,
    'Expected object',
  );
});

Deno.test('SELECT - throws on wrong type', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
      }),
    TypeError,
    "Expected type 'SELECT'",
  );
});

Deno.test('SELECT - throws on missing table', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        columns: ['id'],
        projection: { id: '@id' },
      }),
    TypeError,
    'table',
  );
});

Deno.test('SELECT - throws on empty table', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: '',
        columns: ['id'],
        projection: { id: '@id' },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on empty schema', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        schema: '',
        columns: ['id'],
        projection: { id: '@id' },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on missing columns', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        projection: { id: '@id' },
      }),
    TypeError,
    'columns',
  );
});

Deno.test('SELECT - throws on empty columns array', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: [],
        projection: { id: '@id' },
      }),
    TypeError,
    'non-empty array',
  );
});

Deno.test('SELECT - throws on column with @ prefix', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['@id', 'name'],
        projection: { id: '@id' },
      }),
    TypeError,
    "without '@' prefix",
  );
});

Deno.test('SELECT - throws on missing projection', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
      }),
    TypeError,
    'projection',
  );
});

Deno.test('SELECT - throws on empty projection', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: {},
      }),
    TypeError,
    'at least one property',
  );
});

Deno.test('SELECT - throws on invalid orderBy direction', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        orderBy: { '@id': 'ASCENDING' },
      }),
    TypeError,
    "ASC' or 'DESC",
  );
});

Deno.test('SELECT - throws on negative limit', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        limit: -10,
      }),
    TypeError,
    'positive integer',
  );
});

Deno.test('SELECT - throws on zero limit', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        limit: 0,
      }),
    TypeError,
    'positive integer',
  );
});

Deno.test('SELECT - throws on fractional limit', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        limit: 10.5,
      }),
    TypeError,
    'positive integer',
  );
});

Deno.test('SELECT - throws on negative offset', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        offset: -5,
      }),
    TypeError,
    'non-negative integer',
  );
});

Deno.test('SELECT - throws on fractional offset', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        offset: 5.5,
      }),
    TypeError,
    'non-negative integer',
  );
});

Deno.test('SELECT - throws on non-boolean distinct', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        distinct: 'yes',
      }),
    TypeError,
    'boolean',
  );
});

Deno.test('SELECT - throws on invalid join type', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'Profile.bio'],
        projection: { id: '@id' },
        joins: {
          Profile: {
            table: 'profiles',
            type: 'OUTER',
            on: { '@Profile.@userId': '@id' },
            columns: ['userId', 'bio'],
          },
        },
      }),
    TypeError,
    'valid \'type\'',
  );
});

Deno.test('SELECT - throws on missing join on clause for INNER', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        joins: {
          Profile: {
            table: 'profiles',
            type: 'INNER',
            columns: ['userId'],
          },
        },
      }),
    TypeError,
    "'on' property",
  );
});

Deno.test('SELECT - throws on empty groupBy array', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        groupBy: [],
      }),
    TypeError,
    'non-empty array',
  );
});

Deno.test('SELECT - throws on invalid returnColumns', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { id: '@id' },
        returnColumns: 'id',
      }),
    TypeError,
    'array',
  );
});
Deno.test('SELECT - throws on non-string column element', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 123],
        projection: { id: '@id' },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on empty column element', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', ''],
        projection: { id: '@id' },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on invalid joins structure', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        joins: 'invalid',
      }),
    TypeError,
    'object',
  );
});

Deno.test('SELECT - throws on null joins', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        joins: null,
      }),
    TypeError,
    'object',
  );
});

Deno.test('SELECT - throws on empty join alias', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        joins: {
          '': {
            table: 'orders',
            type: 'LEFT',
          },
        },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on invalid join definition', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        joins: {
          Orders: 'invalid',
        },
      }),
    TypeError,
    'object',
  );
});

Deno.test('SELECT - throws on empty join table', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        joins: {
          Orders: {
            table: '',
            type: 'LEFT',
          },
        },
      }),
    TypeError,
    'non-empty',
  );
});

Deno.test('SELECT - throws on join with empty columns array', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'userId'],
        projection: { id: '@id' },
        joins: {
          Orders: {
            table: 'orders',
            type: 'LEFT',
            on: { '@userId': '@id' },
            columns: [],
          },
        },
      }),
    TypeError,
    'non-empty array',
  );
});

Deno.test('SELECT - throws on join with empty column string', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'userId'],
        projection: { id: '@id' },
        joins: {
          Orders: {
            table: 'orders',
            type: 'LEFT',
            on: { '@userId': '@id' },
            columns: ['id', ''],
          },
        },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on join with non-string column', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'userId'],
        projection: { id: '@id' },
        joins: {
          Orders: {
            table: 'orders',
            type: 'LEFT',
            on: { '@userId': '@id' },
            columns: ['id', 123],
          },
        },
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on invalid orderBy structure', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        orderBy: 'invalid',
      }),
    TypeError,
    'object',
  );
});

Deno.test('SELECT - throws on null orderBy', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        orderBy: null,
      }),
    TypeError,
    'object',
  );
});

Deno.test('SELECT - throws on empty returnColumns element', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        returnColumns: ['id', ''],
      }),
    TypeError,
    'non-empty string',
  );
});

Deno.test('SELECT - throws on non-string returnColumns element', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: '@id' },
        returnColumns: ['id', 123],
      }),
    TypeError,
    'non-empty string',
  );
});
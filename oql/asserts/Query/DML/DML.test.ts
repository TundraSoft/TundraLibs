/**
 * DML Query Validators - Integration Tests
 *
 * Comprehensive tests for all DML query validators to ensure they correctly
 * validate query structures and catch invalid queries.
 *
 * @module asserts/Query/DML
 */

import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  assertCountQuery,
  assertDeleteQuery,
  assertInsertQuery,
  assertSelectQuery,
  assertUpdateQuery,
  assertUpsertQuery,
} from './mod.ts';

// Type definitions for test data
type User = {
  id: number;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type Profile = {
  userId: number;
  bio: string;
  avatar: string;
};

Deno.test('assertSelectQuery - valid queries', () => {
  // Simple SELECT
  const simple = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: { userId: '@id', userName: '@name' },
  };
  assertSelectQuery(simple); // Should not throw

  // SELECT with WHERE
  const withWhere = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'status'],
    projection: { id: '@id', name: '@name' },
    where: { '@status': 'active' },
  };
  assertSelectQuery(withWhere);

  // SELECT with joins
  const withJoins = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'Profile.bio'], // Include joined columns
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
  assertSelectQuery(withJoins);

  // SELECT with aggregates
  const withAggregates = {
    type: 'SELECT',
    table: 'orders',
    columns: ['userId', 'total'],
    projection: {
      userId: '@userId',
      totalSpent: { type: 'SUM', column: '@total' },
      orderCount: { type: 'COUNT', column: '@userId' },
    },
    groupBy: ['@userId'],
    orderBy: { '@userId': 'ASC' }, // Order by source column, not alias
    limit: 10,
  };
  assertSelectQuery(withAggregates);

  // SELECT with all options
  const complete = {
    type: 'SELECT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'name', 'email', 'status', 'createdAt'],
    projection: { id: '@id', name: '@name', email: '@email' },
    where: { '@status': 'active' }, // Simple filter instead of $and
    orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
    limit: 100,
    offset: 0,
    distinct: true,
    returnColumns: ['id', 'name'],
  };
  assertSelectQuery(complete);
});

Deno.test('assertSelectQuery - invalid queries', () => {
  // Missing projection
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

  // Empty projection
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

  // Columns with @ prefix
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['@id', '@name'],
        projection: { id: '@id' },
      }),
    TypeError,
    "without '@' prefix",
  );

  // Invalid orderBy direction
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

  // Negative limit
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

Deno.test('assertInsertQuery - valid queries', () => {
  // Simple INSERT
  const simple = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    data: { id: 1, name: 'John Doe', email: 'john@example.com' },
  };
  assertInsertQuery(simple);

  // INSERT with expression
  const withExpr = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name', 'createdAt'],
    data: {
      id: 1,
      name: 'John',
      createdAt: { type: 'NOW' },
    },
  };
  assertInsertQuery(withExpr);

  // Bulk INSERT
  const bulk = {
    type: 'INSERT',
    table: 'users',
    columns: ['id', 'name'],
    data: [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ],
  };
  assertInsertQuery(bulk);

  // INSERT with all options
  const complete = {
    type: 'INSERT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'name', 'email', 'createdAt'],
    data: {
      id: 1,
      name: 'John',
      email: 'john@example.com',
      createdAt: { type: 'NOW' },
    },
    returnColumns: ['id', 'createdAt'],
  };
  assertInsertQuery(complete);
});

Deno.test('assertInsertQuery - invalid queries', () => {
  // Missing data
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

  // Empty data array
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

  // Data key not in columns
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

  // Data key with @ prefix
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

Deno.test('assertUpdateQuery - valid queries', () => {
  // Simple UPDATE
  const simple = {
    type: 'UPDATE',
    table: 'users',
    columns: ['id', 'name', 'email'],
    data: { email: 'newemail@example.com' },
    where: { '@id': 1 },
  };
  assertUpdateQuery(simple);

  // UPDATE with expression
  const withExpr = {
    type: 'UPDATE',
    table: 'users',
    columns: ['id', 'name', 'updatedAt'],
    data: {
      name: 'Jane Doe',
      updatedAt: { type: 'NOW' },
    },
    where: { '@id': 1 },
  };
  assertUpdateQuery(withExpr);

  // UPDATE all rows (no WHERE)
  const updateAll = {
    type: 'UPDATE',
    table: 'settings',
    columns: ['key', 'value', 'lastSync'],
    data: { lastSync: { type: 'NOW' } },
  };
  assertUpdateQuery(updateAll);

  // UPDATE with complex WHERE
  const complex = {
    type: 'UPDATE',
    table: 'products',
    columns: ['id', 'price', 'discount', 'updatedAt'],
    data: {
      price: { type: 'MULTIPLY', args: ['@price', 0.9] },
      updatedAt: { type: 'NOW' },
    },
    where: { '@discount': true }, // Simple filter instead of $and
    returnColumns: ['id', 'price'],
  };
  assertUpdateQuery(complex);
});

Deno.test('assertUpdateQuery - invalid queries', () => {
  // Missing data
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

  // Empty data
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

  // Data is array (should be object)
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

Deno.test('assertUpsertQuery - valid queries', () => {
  // Simple UPSERT
  const simple = {
    type: 'UPSERT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    data: { id: 1, name: 'John', email: 'john@example.com' },
    conflictKeys: ['id'],
  };
  assertUpsertQuery(simple);

  // UPSERT with partial update on conflict
  const partial = {
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
  assertUpsertQuery(partial);

  // UPSERT with composite key
  const composite = {
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
  assertUpsertQuery(composite);

  // Bulk UPSERT
  const bulk = {
    type: 'UPSERT',
    table: 'settings',
    columns: ['key', 'value'],
    data: [
      { key: 'theme', value: 'dark' },
      { key: 'lang', value: 'en' },
    ],
    conflictKeys: ['key'],
  };
  assertUpsertQuery(bulk);
});

Deno.test('assertUpsertQuery - invalid queries', () => {
  // Missing conflictKeys
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

  // Empty conflictKeys
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

  // conflictKey not in columns
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

  // updateOnConflict includes conflictKey
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

Deno.test('assertDeleteQuery - valid queries', () => {
  // Simple DELETE
  const simple = {
    type: 'DELETE',
    table: 'users',
    columns: ['id', 'status'],
    where: { '@status': 'inactive' },
  };
  assertDeleteQuery(simple);

  // DELETE with complex filter
  const complex = {
    type: 'DELETE',
    table: 'logs',
    columns: ['id', 'createdAt', 'level'],
    where: { '@level': 'debug' }, // Simple filter instead of $and
  };
  assertDeleteQuery(complex);

  // DELETE with returnColumns
  const withReturn = {
    type: 'DELETE',
    table: 'tasks',
    columns: ['id', 'status'],
    where: { '@status': 'completed' },
    returnColumns: ['id', 'status'],
  };
  assertDeleteQuery(withReturn);

  // DELETE all (no WHERE)
  const deleteAll = {
    type: 'DELETE',
    table: 'temp_data',
    columns: ['id', 'data'],
  };
  assertDeleteQuery(deleteAll);

  // DELETE with schema
  const withSchema = {
    type: 'DELETE',
    table: 'users',
    schema: 'archive',
    columns: ['id', 'deletedAt'],
    where: { '@deletedAt': { $lt: new Date('2023-01-01') } },
  };
  assertDeleteQuery(withSchema);
});

Deno.test('assertDeleteQuery - invalid queries', () => {
  // Missing type
  assertThrows(
    () =>
      assertDeleteQuery({
        table: 'users',
        columns: ['id'],
      }),
    TypeError,
    'DELETE',
  );

  // Wrong type
  assertThrows(
    () =>
      assertDeleteQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
      }),
    TypeError,
    'DELETE',
  );

  // Empty table
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

Deno.test('assertCountQuery - valid queries', () => {
  // Simple COUNT
  const simple = {
    type: 'COUNT',
    table: 'users',
    columns: ['id', 'status'],
  };
  assertCountQuery(simple);

  // COUNT with WHERE
  const withWhere = {
    type: 'COUNT',
    table: 'users',
    columns: ['id', 'status', 'createdAt'],
    where: { '@status': 'active' }, // Simple filter instead of $and
  };
  assertCountQuery(withWhere);

  // COUNT DISTINCT
  const distinct = {
    type: 'COUNT',
    table: 'orders',
    columns: ['id', 'userId', 'status'],
    where: { '@status': 'completed' },
    distinct: true,
  };
  assertCountQuery(distinct);

  // COUNT with complex filter
  const complex = {
    type: 'COUNT',
    table: 'products',
    columns: ['id', 'price', 'category', 'inStock'],
    where: { '@inStock': true }, // Simple filter instead of $and
  };
  assertCountQuery(complex);

  // COUNT with schema
  const withSchema = {
    type: 'COUNT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'status'],
    where: { '@status': 'active' },
  };
  assertCountQuery(withSchema);
});

Deno.test('assertCountQuery - invalid queries', () => {
  // Missing columns
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
      }),
    TypeError,
    'columns',
  );

  // Empty columns
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

  // Invalid distinct type
  assertThrows(
    () =>
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: ['id'],
        distinct: 'yes',
      }),
    TypeError,
    'boolean',
  );

  // Columns with @ prefix
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

Deno.test('All validators - type validation', () => {
  // Not an object
  assertThrows(() => assertSelectQuery(null), TypeError);
  assertThrows(() => assertInsertQuery('string'), TypeError);
  assertThrows(() => assertUpdateQuery(123), TypeError);
  assertThrows(() => assertUpsertQuery([]), TypeError);
  assertThrows(() => assertDeleteQuery(undefined), TypeError);
  assertThrows(() => assertCountQuery(true), TypeError);
});

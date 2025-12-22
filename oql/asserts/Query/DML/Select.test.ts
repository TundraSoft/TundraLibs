/**
 * SELECT Query Validator Tests
 *
 * Comprehensive test suite for the SELECT query validator with new structure:
 * - Pre-declared aggregates and expressions
 * - Projection with @ prefix keys and boolean | string values
 * - WHERE can reference columns + expressions + joins (NOT aggregates)
 * - HAVING can reference aggregates only (requires aggregates defined)
 * - ORDER BY can reference projection keys or joined columns
 *
 * @module asserts/Query/DML/Select
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertSelectQuery } from './Select.ts';

//#region Basic SELECT Queries

Deno.test('SELECT - valid simple query', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: { '@id': true, '@name': 'userName' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with schema', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    schema: 'public',
    columns: ['id', 'name'],
    projection: { '@id': true },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with all boolean projection', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: { '@id': true, '@name': true, '@email': true },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with all string projection', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: { '@id': 'userId', '@name': 'userName', '@email': 'userEmail' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with mixed projection', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: { '@id': true, '@name': 'userName', '@email': true },
  };
  assertSelectQuery(query);
});

//#endregion Basic SELECT Queries

//#region Expressions

Deno.test('SELECT - valid with pre-declared expression', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['firstName', 'lastName'],
    expressions: {
      'fullName': { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
    },
    projection: { '@fullName': true },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with multiple expressions', () => {
  const query = {
    type: 'SELECT',
    table: 'products',
    columns: ['price', 'tax', 'discount'],
    expressions: {
      'priceWithTax': { type: 'ADD', args: ['@price', '@tax'] },
      'finalPrice': { type: 'SUBTRACT', args: ['@price', '@discount'] },
    },
    projection: { '@priceWithTax': 'total', '@finalPrice': true },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with expression in WHERE', () => {
  const query = {
    type: 'SELECT',
    table: 'products',
    columns: ['id', 'price', 'tax'],
    expressions: {
      'total': { type: 'ADD', args: ['@price', '@tax'] },
    },
    projection: { '@id': true, '@total': true },
    where: { '@total': { $gt: 100 } },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with nested expression', () => {
  const query = {
    type: 'SELECT',
    table: 'products',
    columns: ['price', 'tax', 'discount'],
    expressions: {
      'finalPrice': {
        type: 'SUBTRACT',
        args: [
          { type: 'ADD', args: ['@price', '@tax'] },
          '@discount',
        ],
      },
    },
    projection: { '@finalPrice': 'total' },
  };
  assertSelectQuery(query);
});

//#endregion Expressions

//#region Aggregates

Deno.test('SELECT - valid with aggregate', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['userId', 'total'],
    aggregates: {
      'totalSpent': { type: 'SUM', column: '@total' },
    },
    projection: { '@userId': true, '@totalSpent': true },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with multiple aggregates', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['userId', 'total', 'quantity'],
    aggregates: {
      'totalSpent': { type: 'SUM', column: '@total' },
      'orderCount': { type: 'COUNT', column: '@userId' },
      'avgQuantity': { type: 'AVG', column: '@quantity' },
    },
    projection: {
      '@userId': true,
      '@totalSpent': 'spent',
      '@orderCount': 'count',
      '@avgQuantity': true,
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with aggregate and HAVING', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['userId', 'total'],
    aggregates: {
      'totalSpent': { type: 'SUM', column: '@total' },
    },
    projection: { '@userId': true, '@totalSpent': true },
    having: { '@totalSpent': { $gt: 1000 } },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with aggregate and complex HAVING', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['userId', 'total'],
    aggregates: {
      'totalSpent': { type: 'SUM', column: '@total' },
      'orderCount': { type: 'COUNT', column: '@userId' },
    },
    projection: { '@userId': true, '@totalSpent': true, '@orderCount': true },
    having: {
      '@totalSpent': { $gte: 500 },
      '@orderCount': { $gte: 5 },
    },
  };
  assertSelectQuery(query);
});

//#endregion Aggregates

//#region Joins

Deno.test('SELECT - valid with LEFT JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    joins: {
      Profile: {
        table: 'profiles',
        type: 'LEFT',
        columns: ['userId', 'bio'],
        on: { '@Profile.@userId': '@id' },
      },
    },
    projection: { '@id': true, '@name': true, '@Profile.@bio': 'bio' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with INNER JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['id', 'userId'],
    joins: {
      User: {
        table: 'users',
        type: 'INNER',
        columns: ['id', 'name'],
        on: { '@User.@id': '@userId' },
      },
    },
    projection: { '@id': 'orderId', '@User.@name': 'userName' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with RIGHT JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    joins: {
      Order: {
        table: 'orders',
        type: 'RIGHT',
        columns: ['userId', 'total'],
        on: { '@Order.@userId': '@id' },
      },
    },
    projection: { '@id': true, '@Order.@total': 'total' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with FULL JOIN', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    joins: {
      Log: {
        table: 'logs',
        type: 'FULL',
        columns: ['userId', 'action'],
        on: { '@Log.@userId': '@id' },
      },
    },
    projection: { '@id': true, '@Log.@action': 'action' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with FULL JOIN (alternative)', () => {
  const query = {
    type: 'SELECT',
    table: 'products',
    columns: ['id', 'name', 'categoryId'],
    joins: {
      Category: {
        table: 'categories',
        type: 'FULL',
        columns: ['id', 'name'],
        on: { '@Category.@id': '@categoryId' },
      },
    },
    projection: { '@id': true, '@Category.@name': 'category' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with multiple joins', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['id', 'userId'],
    joins: {
      User: {
        table: 'users',
        type: 'INNER',
        columns: ['id', 'name'],
        on: { '@User.@id': '@userId' },
      },
      Product: {
        table: 'products',
        type: 'LEFT',
        columns: ['id', 'name', 'price'],
        on: { '@Product.@id': '@id' },
      },
    },
    projection: {
      '@id': true,
      '@User.@name': 'userName',
      '@Product.@price': 'price',
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with join in WHERE', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['id', 'userId'],
    joins: {
      User: {
        table: 'users',
        type: 'INNER',
        columns: ['id', 'name', 'status'],
        on: { '@User.@id': '@userId' },
      },
    },
    projection: { '@id': true, '@User.@name': 'userName' },
    where: { '@User.@status': 'active' },
  };
  assertSelectQuery(query);
});

//#endregion Joins

//#region WHERE Clause

Deno.test('SELECT - valid with WHERE on column', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'status'],
    projection: { '@id': true, '@name': true },
    where: { '@status': 'active' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with complex WHERE', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'age', 'status'],
    projection: { '@id': true },
    where: {
      '@status': 'active',
      '@age': { $gte: 18 },
    },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with WHERE on expression', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['firstName', 'lastName'],
    expressions: {
      'fullName': { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
    },
    projection: { '@fullName': true },
    where: { '@fullName': { $like: 'John%' } },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with WHERE on columns and expressions', () => {
  const query = {
    type: 'SELECT',
    table: 'products',
    columns: ['id', 'price', 'tax', 'inStock'],
    expressions: {
      'total': { type: 'ADD', args: ['@price', '@tax'] },
    },
    projection: { '@id': true, '@total': true },
    where: {
      '@inStock': true,
      '@total': { $lte: 100 },
    },
  };
  assertSelectQuery(query);
});

//#endregion WHERE Clause

//#region ORDER BY

Deno.test('SELECT - valid with orderBy ASC', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'createdAt'],
    projection: { '@id': true, '@name': true, '@createdAt': true },
    orderBy: { '@createdAt': 'ASC' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with orderBy DESC', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { '@id': true, '@name': 'userName' },
    orderBy: { '@name': 'DESC' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with multiple orderBy', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'createdAt'],
    projection: { '@id': true, '@name': true, '@createdAt': 'created' },
    orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with orderBy on joined column', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    columns: ['id', 'userId'],
    joins: {
      User: {
        table: 'users',
        type: 'INNER',
        columns: ['id', 'name'],
        on: { '@User.@id': '@userId' },
      },
    },
    projection: { '@id': true, '@User.@name': 'userName' },
    orderBy: { '@User.@name': 'ASC' },
  };
  assertSelectQuery(query);
});

//#endregion ORDER BY

//#region Limit and Offset

Deno.test('SELECT - valid with limit', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { '@id': true },
    limit: 10,
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with offset', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { '@id': true },
    offset: 20,
  };
  assertSelectQuery(query);
});

Deno.test('SELECT - valid with limit and offset', () => {
  const query = {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name'],
    projection: { '@id': true },
    limit: 10,
    offset: 20,
  };
  assertSelectQuery(query);
});

//#endregion Limit and Offset

//#region Complex Scenarios

Deno.test('SELECT - valid with all features', () => {
  const query = {
    type: 'SELECT',
    table: 'orders',
    schema: 'public',
    columns: ['id', 'userId', 'total', 'quantity'],
    expressions: {
      'avgPrice': { type: 'DIVIDE', args: ['@total', '@quantity'] },
    },
    aggregates: {
      'totalRevenue': { type: 'SUM', column: '@total' },
      'orderCount': { type: 'COUNT', column: '@id' },
    },
    joins: {
      User: {
        table: 'users',
        type: 'INNER',
        columns: ['id', 'name', 'status'],
        on: { '@User.@id': '@userId' },
      },
    },
    projection: {
      '@userId': 'user',
      '@User.@name': 'userName',
      '@totalRevenue': 'revenue',
      '@orderCount': 'orders',
    },
    where: { '@User.@status': 'active' },
    having: {
      '@totalRevenue': { $gte: 1000 },
      '@orderCount': { $gte: 5 },
    },
    orderBy: { '@totalRevenue': 'DESC' },
    limit: 100,
    offset: 0,
  };
  assertSelectQuery(query);
});

//#endregion Complex Scenarios

//#region Invalid Queries - Basic Validation

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
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
      }),
    TypeError,
    "without '@' prefix",
  );
});

//#endregion Invalid Queries - Basic Validation

//#region Invalid Queries - Projection

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

Deno.test('SELECT - throws on projection key without @ prefix', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { id: true },
      }),
    TypeError,
    "must start with '@'",
  );
});

Deno.test('SELECT - throws on projection key referencing non-existent column', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@email': true },
      }),
    TypeError,
    'does not exist',
  );
});

Deno.test('SELECT - throws on projection value not boolean or string', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': 123 },
      }),
    TypeError,
    'boolean or string',
  );
});

Deno.test('SELECT - throws on projection with empty string alias', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': '' },
      }),
    TypeError,
    'cannot be empty string',
  );
});

//#endregion Invalid Queries - Projection

//#region Invalid Queries - WHERE and HAVING

Deno.test('SELECT - throws when WHERE references aggregate', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total'],
        aggregates: {
      'totalSpent': { type: 'SUM', column: '@total' },
        },
        projection: { '@userId': true, '@totalSpent': true },
        where: { '@totalSpent': { $gt: 1000 } },
      }),
    TypeError,
    'not in the provided column list',
  );
});

Deno.test('SELECT - throws when HAVING present without aggregates', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        having: { '@id': { $gt: 100 } },
      }),
    TypeError,
    "requires 'aggregates'",
  );
});

Deno.test('SELECT - throws when HAVING references non-aggregate', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total'],
        aggregates: {
      'totalSpent': { type: 'SUM', column: '@total' },
        },
        projection: { '@userId': true, '@totalSpent': true },
        having: { '@userId': 1 },
      }),
    TypeError,
    'not in the provided column list',
  );
});

//#endregion Invalid Queries - WHERE and HAVING

//#region Invalid Queries - ORDER BY

Deno.test('SELECT - throws on invalid orderBy direction', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true, '@name': true },
        orderBy: { '@id': 'ASCENDING' },
      }),
    TypeError,
    "ASC' or 'DESC",
  );
});

Deno.test('SELECT - throws on orderBy non-projected key', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': true },
        orderBy: { '@email': 'ASC' },
      }),
    TypeError,
    'must exist in projection',
  );
});

//#endregion Invalid Queries - ORDER BY

//#region Invalid Queries - Limit and Offset

Deno.test('SELECT - throws on negative limit', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
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
        projection: { '@id': true },
        offset: 10.5,
      }),
    TypeError,
    'non-negative integer',
  );
});

//#endregion Invalid Queries - Limit and Offset

//#region Deprecated Properties

Deno.test('SELECT - throws on deprecated groupBy property', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total'],
        projection: { '@userId': true },
        groupBy: ['@userId'],
      }),
    TypeError,
    'no longer supported',
  );
});

Deno.test('SELECT - throws on deprecated distinct property', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        distinct: true,
      }),
    TypeError,
    'no longer supported',
  );
});

Deno.test('SELECT - throws on deprecated returnColumns property', () => {
  assertThrows(
    () =>
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        returnColumns: ['id'],
      }),
    TypeError,
    'no longer supported',
  );
});

//#endregion Deprecated Properties





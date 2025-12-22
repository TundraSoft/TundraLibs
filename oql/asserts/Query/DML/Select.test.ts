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

import * as asserts from '$asserts';
import { assertSelectQuery } from './Select.ts';

Deno.test('oql.asserts.Query.DML.Select', async (t) => {
  await t.step('basic queries', async (u) => {
    await u.step('simple query', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': 'userName' },
      };
      assertSelectQuery(query);
    });

    await u.step('with schema', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'name'],
        projection: { '@id': true },
      };
      assertSelectQuery(query);
    });

    await u.step('with all boolean projection', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': true, '@email': true },
      };
      assertSelectQuery(query);
    });

    await u.step('with all string projection', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: {
          '@id': 'userId',
          '@name': 'userName',
          '@email': 'userEmail',
        },
      };
      assertSelectQuery(query);
    });

    await u.step('with mixed projection', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': 'userName', '@email': true },
      };
      assertSelectQuery(query);
    });
  });

  await t.step('expressions', async (u) => {
    await u.step('with pre-declared expression', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['firstName', 'lastName'],
        expressions: {
          'fullName': {
            type: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
        },
        projection: { '@fullName': true },
      };
      assertSelectQuery(query);
    });

    await u.step('with multiple expressions', () => {
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

    await u.step('with expression in WHERE', () => {
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

    await u.step('with nested expression', () => {
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
  });

  await t.step('aggregates', async (u) => {
    await u.step('with aggregate', () => {
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

    await u.step('with multiple aggregates', () => {
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

    await u.step('with aggregate and HAVING', () => {
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

    await u.step('with aggregate and complex HAVING', () => {
      const query = {
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total'],
        aggregates: {
          'totalSpent': { type: 'SUM', column: '@total' },
          'orderCount': { type: 'COUNT', column: '@userId' },
        },
        projection: {
          '@userId': true,
          '@totalSpent': true,
          '@orderCount': true,
        },
        having: {
          '@totalSpent': { $gte: 500 },
          '@orderCount': { $gte: 5 },
        },
      };
      assertSelectQuery(query);
    });
  });

  await t.step('joins', async (u) => {
    await u.step('with LEFT JOIN', () => {
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

    await u.step('with INNER JOIN', () => {
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

    await u.step('with RIGHT JOIN', () => {
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

    await u.step('with FULL JOIN', () => {
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

    await u.step('with FULL JOIN (alternative)', () => {
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

    await u.step('with multiple joins', () => {
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

    await u.step('with join in WHERE', () => {
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
  });

  await t.step('WHERE clause', async (u) => {
    await u.step('with WHERE on column', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'status'],
        projection: { '@id': true, '@name': true },
        where: { '@status': 'active' },
      };
      assertSelectQuery(query);
    });

    await u.step('with complex WHERE', () => {
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

    await u.step('with WHERE on expression', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['firstName', 'lastName'],
        expressions: {
          'fullName': {
            type: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
        },
        projection: { '@fullName': true },
        where: { '@fullName': { $like: 'John%' } },
      };
      assertSelectQuery(query);
    });

    await u.step('with WHERE on columns and expressions', () => {
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
  });

  await t.step('ORDER BY', async (u) => {
    await u.step('with orderBy ASC', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        projection: { '@id': true, '@name': true, '@createdAt': true },
        orderBy: { '@createdAt': 'ASC' },
      };
      assertSelectQuery(query);
    });

    await u.step('with orderBy DESC', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true, '@name': 'userName' },
        orderBy: { '@name': 'DESC' },
      };
      assertSelectQuery(query);
    });

    await u.step('with multiple orderBy', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        projection: { '@id': true, '@name': true, '@createdAt': 'created' },
        orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
      };
      assertSelectQuery(query);
    });

    await u.step('with orderBy on joined column', () => {
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
  });

  await t.step('limit and offset', async (u) => {
    await u.step('with limit', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        limit: 10,
      };
      assertSelectQuery(query);
    });

    await u.step('with offset', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        offset: 20,
      };
      assertSelectQuery(query);
    });

    await u.step('with limit and offset', () => {
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
  });

  await t.step('complex scenarios', async (u) => {
    await u.step('with all features', () => {
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
  });

  await t.step('invalid type', async (u) => {
    await u.step('null', () => {
      asserts.assertThrows(
        () => assertSelectQuery(null),
        TypeError,
        'Expected object',
      );
    });

    await u.step('non-object', () => {
      asserts.assertThrows(
        () => assertSelectQuery('not an object'),
        TypeError,
        'Expected object',
      );
    });

    await u.step('wrong type', () => {
      asserts.assertThrows(
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
  });

  await t.step('invalid table and schema', async (u) => {
    await u.step('missing table', () => {
      asserts.assertThrows(
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

    await u.step('empty table', () => {
      asserts.assertThrows(
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

    await u.step('empty schema', () => {
      asserts.assertThrows(
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
  });

  await t.step('invalid columns', async (u) => {
    await u.step('missing columns', () => {
      asserts.assertThrows(
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

    await u.step('empty columns array', () => {
      asserts.assertThrows(
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

    await u.step('column with @ prefix', () => {
      asserts.assertThrows(
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
  });

  await t.step('invalid projection', async (u) => {
    await u.step('missing projection', () => {
      asserts.assertThrows(
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

    await u.step('empty projection', () => {
      asserts.assertThrows(
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

    await u.step('projection key without @ prefix', () => {
      asserts.assertThrows(
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

    await u.step('projection key referencing non-existent column', () => {
      asserts.assertThrows(
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

    await u.step('projection value not boolean or string', () => {
      asserts.assertThrows(
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

    await u.step('projection with empty string alias', () => {
      asserts.assertThrows(
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
  });

  await t.step('invalid WHERE and HAVING', async (u) => {
    await u.step('WHERE references aggregate', () => {
      asserts.assertThrows(
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

    await u.step('HAVING present without aggregates', () => {
      asserts.assertThrows(
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

    await u.step('HAVING references non-aggregate', () => {
      asserts.assertThrows(
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
  });

  await t.step('invalid ORDER BY', async (u) => {
    await u.step('orderBy direction', () => {
      asserts.assertThrows(
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

    await u.step('orderBy non-projected key', () => {
      asserts.assertThrows(
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
  });

  await t.step('invalid limit and offset', async (u) => {
    await u.step('negative limit', () => {
      asserts.assertThrows(
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

    await u.step('zero limit', () => {
      asserts.assertThrows(
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

    await u.step('fractional limit', () => {
      asserts.assertThrows(
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

    await u.step('negative offset', () => {
      asserts.assertThrows(
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

    await u.step('fractional offset', () => {
      asserts.assertThrows(
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
  });

  await t.step('deprecated properties', async (u) => {
    await u.step('deprecated groupBy property', () => {
      asserts.assertThrows(
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

    await u.step('deprecated distinct property', () => {
      asserts.assertThrows(
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

    await u.step('deprecated returnColumns property', () => {
      asserts.assertThrows(
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
  });
});

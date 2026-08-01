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

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertSelectQuery, isSelectQuery } from './select.ts';

describe('oql.asserts.Query.DML.Select', () => {
  describe('basic queries', () => {
    it('simple query', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': 'userName' },
      };
      assertSelectQuery(query);
    });

    it('with schema', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'name'],
        projection: { '@id': true },
      };
      assertSelectQuery(query);
    });

    it('with all boolean projection', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': true, '@email': true },
      };
      assertSelectQuery(query);
    });

    it('with all string projection', () => {
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

    it('with mixed projection', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': 'userName', '@email': true },
      };
      assertSelectQuery(query);
    });
  });

  describe('expressions', () => {
    it('with pre-declared expression', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['firstName', 'lastName'],
        expressions: {
          'fullName': {
            $$_expression: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
        },
        projection: { '@fullName': true },
      };
      assertSelectQuery(query);
    });

    it('with multiple expressions', () => {
      const query = {
        type: 'SELECT',
        table: 'products',
        columns: ['price', 'tax', 'discount'],
        expressions: {
          'priceWithTax': { $$_expression: 'ADD', args: ['@price', '@tax'] },
          'finalPrice': {
            $$_expression: 'SUBTRACT',
            args: ['@price', '@discount'],
          },
        },
        projection: { '@priceWithTax': 'total', '@finalPrice': true },
      };
      assertSelectQuery(query);
    });

    it('with expression in WHERE', () => {
      const query = {
        type: 'SELECT',
        table: 'products',
        columns: ['id', 'price', 'tax'],
        expressions: {
          'total': { $$_expression: 'ADD', args: ['@price', '@tax'] },
        },
        projection: { '@id': true, '@total': true },
        where: { '@total': { $gt: 100 } },
      };
      assertSelectQuery(query);
    });

    it('with nested expression', () => {
      const query = {
        type: 'SELECT',
        table: 'products',
        columns: ['price', 'tax', 'discount'],
        expressions: {
          'finalPrice': {
            $$_expression: 'SUBTRACT',
            args: [
              { $$_expression: 'ADD', args: ['@price', '@tax'] },
              '@discount',
            ],
          },
        },
        projection: { '@finalPrice': 'total' },
      };
      assertSelectQuery(query);
    });
  });

  describe('aggregates', () => {
    it('with aggregate', () => {
      const query = {
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total'],
        aggregates: {
          'totalSpent': { $$_aggregate: 'SUM', column: '@total' },
        },
        projection: { '@userId': true, '@totalSpent': true },
      };
      assertSelectQuery(query);
    });

    it('with multiple aggregates', () => {
      const query = {
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total', 'quantity'],
        aggregates: {
          'totalSpent': { $$_aggregate: 'SUM', column: '@total' },
          'orderCount': { $$_aggregate: 'COUNT', column: '@userId' },
          'avgQuantity': { $$_aggregate: 'AVG', column: '@quantity' },
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

    it('with aggregate and HAVING', () => {
      const query = {
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total'],
        aggregates: {
          'totalSpent': { $$_aggregate: 'SUM', column: '@total' },
        },
        projection: { '@userId': true, '@totalSpent': true },
        having: { '@totalSpent': { $gt: 1000 } },
      };
      assertSelectQuery(query);
    });

    it('with aggregate and complex HAVING', () => {
      const query = {
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'total'],
        aggregates: {
          'totalSpent': { $$_aggregate: 'SUM', column: '@total' },
          'orderCount': { $$_aggregate: 'COUNT', column: '@userId' },
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

  describe('invalid aggregates', () => {
    it('aggregates is null', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            projection: { '@id': true },
            aggregates: null as any,
          }),
        TypeError,
        'must be an object',
      );
    });

    it('aggregates is an array', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            projection: { '@id': true },
            aggregates: [] as any,
          }),
        TypeError,
        'must be an object',
      );
    });

    it('aggregates is empty object', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            projection: { '@id': true },
            aggregates: {},
          }),
        TypeError,
        'cannot be an empty object',
      );
    });

    it('aggregate key is empty string', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['total'],
            projection: { '@total': true },
            aggregates: { '': { $$_aggregate: 'SUM', column: '@total' } },
          }),
        TypeError,
        'non-empty strings',
      );
    });

    it('aggregate key starts with @', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'orders',
            columns: ['total'],
            projection: { '@@sum': true },
            aggregates: { '@sum': { $$_aggregate: 'SUM', column: '@total' } },
          }),
        TypeError,
        "must not start with '@'",
      );
    });

    it('aggregate value is invalid', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'orders',
            columns: ['total'],
            projection: { '@sum': true },
            aggregates: { sum: { type: 'INVALID', column: '@total' } as any },
          }),
        TypeError,
        "aggregates['sum'] is invalid",
      );
    });
  });

  describe('invalid joins', () => {
    it('joins validation error', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'orders',
            columns: ['id'],
            projection: { '@id': true },
            joins: { User: { type: 'INVALID' } } as any,
          }),
        TypeError,
        "'joins' is invalid",
      );
    });
  });

  describe('joins', () => {
    it('with LEFT JOIN', () => {
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

    it('with INNER JOIN', () => {
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

    it('with RIGHT JOIN', () => {
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

    it('with FULL JOIN', () => {
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

    it('with FULL JOIN (alternative)', () => {
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

    it('with multiple joins', () => {
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

    it('with join in WHERE', () => {
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

  describe('WHERE clause', () => {
    it('with WHERE on column', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'status'],
        projection: { '@id': true, '@name': true },
        where: { '@status': 'active' },
      };
      assertSelectQuery(query);
    });

    it('with complex WHERE', () => {
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

    it('with WHERE on expression', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['firstName', 'lastName'],
        expressions: {
          'fullName': {
            $$_expression: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
        },
        projection: { '@fullName': true },
        where: { '@fullName': { $like: 'John%' } },
      };
      assertSelectQuery(query);
    });

    it('with WHERE on columns and expressions', () => {
      const query = {
        type: 'SELECT',
        table: 'products',
        columns: ['id', 'price', 'tax', 'inStock'],
        expressions: {
          'total': { $$_expression: 'ADD', args: ['@price', '@tax'] },
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

  describe('ORDER BY', () => {
    it('with orderBy ASC', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        projection: { '@id': true, '@name': true, '@createdAt': true },
        orderBy: { '@createdAt': 'ASC' },
      };
      assertSelectQuery(query);
    });

    it('with orderBy DESC', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true, '@name': 'userName' },
        orderBy: { '@name': 'DESC' },
      };
      assertSelectQuery(query);
    });

    it('with multiple orderBy', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        projection: { '@id': true, '@name': true, '@createdAt': 'created' },
        orderBy: { '@createdAt': 'DESC', '@name': 'ASC' },
      };
      assertSelectQuery(query);
    });

    it('with orderBy on joined column', () => {
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

  describe('limit and offset', () => {
    it('with limit', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        limit: 10,
      };
      assertSelectQuery(query);
    });

    it('with offset', () => {
      const query = {
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        offset: 20,
      };
      assertSelectQuery(query);
    });

    it('with limit and offset', () => {
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

  describe('complex scenarios', () => {
    it('with all features', () => {
      const query = {
        type: 'SELECT',
        table: 'orders',
        schema: 'public',
        columns: ['id', 'userId', 'total', 'quantity'],
        expressions: {
          'avgPrice': {
            $$_expression: 'DIVIDE',
            args: ['@total', '@quantity'],
          },
        },
        aggregates: {
          'totalRevenue': { $$_aggregate: 'SUM', column: '@total' },
          'orderCount': { $$_aggregate: 'COUNT', column: '@id' },
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

  describe('invalid type', () => {
    it('null', () => {
      asserts.assertThrows(
        () => assertSelectQuery(null),
        TypeError,
        'Expected object',
      );
    });

    it('non-object', () => {
      asserts.assertThrows(
        () => assertSelectQuery('not an object'),
        TypeError,
        'Expected object',
      );
    });

    it('wrong type', () => {
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

  describe('invalid table and schema', () => {
    it('missing table', () => {
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

    it('empty table', () => {
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

    it('empty schema', () => {
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

  describe('invalid columns', () => {
    it('missing columns', () => {
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

    it('empty columns array', () => {
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

    it('column with @ prefix', () => {
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

  describe('invalid projection', () => {
    it('projection is an array', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name'],
            projection: ['@id', '@name'] as any,
          }),
        TypeError,
        'must be an object, not an array',
      );
    });

    it('projection key is empty string', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name'],
            projection: { '': true },
          }),
        TypeError,
        'non-empty strings',
      );
    });

    it('projection key is whitespace', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name'],
            projection: { '  ': true },
          }),
        TypeError,
        'non-empty strings',
      );
    });

    it('missing projection', () => {
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

    it('empty projection', () => {
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

    it('projection key without @ prefix', () => {
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

    it('projection key referencing non-existent column', () => {
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

    it('projection value not boolean or string', () => {
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

    it('projection with empty string alias', () => {
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

  describe('invalid WHERE and HAVING', () => {
    it('WHERE references aggregate', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'orders',
            columns: ['userId', 'total'],
            aggregates: {
              'totalSpent': { $$_aggregate: 'SUM', column: '@total' },
            },
            projection: { '@userId': true, '@totalSpent': true },
            where: { '@totalSpent': { $gt: 1000 } },
          }),
        TypeError,
        'not in the provided column list',
      );
    });

    it('HAVING present without aggregates', () => {
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

    it('HAVING references non-aggregate', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'orders',
            columns: ['userId', 'total'],
            aggregates: {
              'totalSpent': { $$_aggregate: 'SUM', column: '@total' },
            },
            projection: { '@userId': true, '@totalSpent': true },
            having: { '@userId': 1 },
          }),
        TypeError,
        'not in the provided column list',
      );
    });
  });

  describe('invalid ORDER BY', () => {
    it('orderBy is not an object', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name'],
            projection: { '@id': true },
            orderBy: [] as any,
          }),
        TypeError,
        'must be an object',
      );

      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name'],
            projection: { '@id': true },
            orderBy: null as any,
          }),
        TypeError,
        'must be an object',
      );
    });

    it('orderBy is empty object', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name'],
            projection: { '@id': true },
            orderBy: {},
          }),
        TypeError,
        'cannot be an empty object',
      );
    });

    it('orderBy direction', () => {
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

    it('orderBy non-projected key', () => {
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

  describe('invalid limit and offset', () => {
    it('negative limit', () => {
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

    it('zero limit', () => {
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

    it('fractional limit', () => {
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

    it('negative offset', () => {
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

    it('fractional offset', () => {
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

  describe('distinct', () => {
    it('valid: distinct true', () => {
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'role'],
        projection: { '@role': true },
        distinct: true,
      });
    });

    it('valid: distinct false', () => {
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
        distinct: false,
      });
    });

    it('valid: distinct true alongside joins (no auto-expand projection)', () => {
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        distinct: true,
        joins: {
          o: {
            table: 'orders',
            columns: ['userId', 'status'],
            type: 'LEFT',
            on: { '@o.@userId': '@id' },
          },
        },
        projection: { '@id': true, '@name': true },
        where: { '@o.@status': 'paid' },
      });
    });

    it('invalid: non-boolean distinct', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            projection: { '@id': true },
            distinct: 1,
          }),
        TypeError,
        "'distinct' must be a boolean",
      );
    });

    it('invalid: distinct true with aggregates (GROUP BY already dedups)', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'orders',
            columns: ['userId', 'amount'],
            distinct: true,
            aggregates: { total: { $$_aggregate: 'SUM', column: '@amount' } },
            projection: { '@userId': true, '@total': 'total' },
          }),
        TypeError,
        "'distinct' cannot be combined with 'aggregates'",
      );
    });

    it('valid: distinct false with aggregates', () => {
      assertSelectQuery({
        type: 'SELECT',
        table: 'orders',
        columns: ['userId', 'amount'],
        distinct: false,
        aggregates: { total: { $$_aggregate: 'SUM', column: '@amount' } },
        projection: { '@userId': true, '@total': 'total' },
      });
    });

    it('invalid: distinct true with join-alias projection (JSON_ROW auto-expand)', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id', 'name'],
            distinct: true,
            joins: {
              Profile: {
                table: 'profiles',
                columns: ['userId', 'bio'],
                type: 'LEFT',
                on: { '@Profile.@userId': '@id' },
              },
            },
            projection: { '@id': true, '@Profile': 'profile' },
          }),
        TypeError,
        "'distinct' cannot be combined with join-alias projection",
      );
    });
  });

  describe('where with $exists', () => {
    it('valid: $exists subquery filter', () => {
      assertSelectQuery({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name'],
        projection: { '@id': true },
        where: {
          $exists: {
            table: 'orders',
            on: { '@userId': '@id' },
            where: { '@status': 'paid' },
          },
        },
      });
    });

    it('invalid: malformed $exists spec', () => {
      asserts.assertThrows(
        () =>
          assertSelectQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            projection: { '@id': true },
            where: { $exists: { table: 'orders', on: {} } },
          }),
        TypeError,
        "'$exists' is invalid",
      );
    });
  });

  describe('deprecated properties', () => {
    it('deprecated groupBy property', () => {
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

    it('deprecated returnColumns property', () => {
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

  describe('isSelectQuery type guard', () => {
    it('returns true for valid queries', () => {
      asserts.assertEquals(
        isSelectQuery({
          type: 'SELECT',
          table: 'users',
          columns: ['id'],
          projection: { '@id': true },
        }),
        true,
      );

      asserts.assertEquals(
        isSelectQuery({
          type: 'SELECT',
          table: 'orders',
          columns: ['id', 'total'],
          aggregates: { sum: { $$_aggregate: 'SUM', column: '@total' } },
          projection: { '@id': true, '@sum': true },
        }),
        true,
      );
    });

    it('returns false for invalid queries', () => {
      asserts.assertEquals(isSelectQuery(null), false);
      asserts.assertEquals(isSelectQuery('SELECT'), false);
      asserts.assertEquals(isSelectQuery({}), false);
      asserts.assertEquals(
        isSelectQuery({
          type: 'SELECT',
          table: 'users',
        }),
        false,
      );
      asserts.assertEquals(
        isSelectQuery({
          type: 'INSERT',
          table: 'users',
          columns: ['id'],
          projection: { '@id': true },
        }),
        false,
      );
    });

    it('type narrowing works', () => {
      const query: unknown = {
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
      };

      if (isSelectQuery(query)) {
        asserts.assertEquals(query.type, 'SELECT');
        asserts.assertEquals(query.table, 'users');
      }
    });
  });
});

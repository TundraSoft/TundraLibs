/**
 * COUNT Query Validator Tests
 *
 * Comprehensive test suite for the COUNT query validator.
 *
 * @module asserts/Query/DML/Count
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertCountQuery, isCountQuery } from './count.ts';

describe('oql.asserts.Query.DML.Count', () => {
  describe('valid queries', () => {
    it('simple query', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'status'],
      };
      assertCountQuery(query);
    });

    it('with schema', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'status'],
      };
      assertCountQuery(query);
    });

    it('with WHERE', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'status', 'createdAt'],
        where: { '@status': 'active' },
      };
      assertCountQuery(query);
    });

    it('with complex WHERE', () => {
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

    it('with IN operator', () => {
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

    it('with comparison operators', () => {
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

    it('with NULL check', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'deletedAt'],
        where: { '@deletedAt': { $null: false } },
      };
      assertCountQuery(query);
    });

    it('with pre-declared expression', () => {
      const query = {
        type: 'COUNT',
        table: 'orders',
        columns: ['id', 'userId', 'status', 'total', 'discount'],
        expressions: {
          'finalPrice': {
            $$_expression: 'SUBTRACT',
            args: ['@total', '@discount'],
          },
        },
        where: {
          $and: [
            { '@status': 'completed' },
            { '@finalPrice': { $gte: 100 } },
          ],
        },
      };
      assertCountQuery(query);
    });

    it('with multiple expressions', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['firstName', 'lastName', 'age', 'status'],
        expressions: {
          'fullName': {
            $$_expression: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
          'ageText': { $$_expression: 'CONCAT', args: ['Age: ', '@age'] },
        },
        where: {
          '@fullName': { $like: 'John%' },
          '@age': { $gte: 18 },
          '@status': 'active',
        },
      };
      assertCountQuery(query);
    });

    it('with nested expression', () => {
      const query = {
        type: 'COUNT',
        table: 'products',
        columns: ['id', 'price', 'tax', 'discount'],
        expressions: {
          'finalPrice': {
            $$_expression: 'SUBTRACT',
            args: [
              { $$_expression: 'ADD', args: ['@price', '@tax'] },
              '@discount',
            ],
          },
        },
        where: { '@finalPrice': { $gte: 50 } },
      };
      assertCountQuery(query);
    });
  });

  describe('invalid having', () => {
    it('rejects a having clause (COUNT has no GROUP BY to filter on)', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'users',
            columns: ['id', 'age'],
            where: { '@age': { $gt: 18 } },
            having: { '@age': { $gt: 1 } },
          }),
        TypeError,
        "'having' is not supported",
      );
    });
  });

  describe('invalid type', () => {
    it('null', () => {
      asserts.assertThrows(
        () => assertCountQuery(null),
        TypeError,
        'Expected object',
      );
    });

    it('boolean', () => {
      asserts.assertThrows(
        () => assertCountQuery(true),
        TypeError,
        'Expected object',
      );
    });

    it('wrong type', () => {
      asserts.assertThrows(
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
  });

  describe('invalid table', () => {
    it('missing table', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            columns: ['id'],
          }),
        TypeError,
        'table',
      );
    });

    it('empty table', () => {
      asserts.assertThrows(
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

    it('empty schema', () => {
      asserts.assertThrows(
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
  });

  describe('invalid columns', () => {
    it('missing columns', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'users',
          }),
        TypeError,
        'columns',
      );
    });

    it('empty columns', () => {
      asserts.assertThrows(
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

    it('column with @ prefix', () => {
      asserts.assertThrows(
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

    it('empty column string', () => {
      asserts.assertThrows(
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

    it('non-string column', () => {
      asserts.assertThrows(
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

    it('non-array columns', () => {
      asserts.assertThrows(
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
  });

  describe('distinct', () => {
    it('valid: single declared column', () => {
      assertCountQuery({
        type: 'COUNT',
        table: 'orders',
        columns: ['id', 'userId'],
        distinct: ['userId'],
      });
    });

    it('valid: distinct with joins and WHERE', () => {
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: ['id'],
        distinct: ['id'],
        joins: {
          o: {
            table: 'orders',
            columns: ['userId', 'status'],
            type: 'LEFT',
            on: { '@o.@userId': '@id' },
          },
        },
        where: { '@o.@status': 'paid' },
      });
    });

    it('invalid: non-array distinct', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id'],
            distinct: 'id',
          }),
        TypeError,
        "'distinct' must be an array",
      );
    });

    it('invalid: empty array', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id'],
            distinct: [],
          }),
        TypeError,
        'cannot be an empty array',
      );
    });

    it('invalid: more than one column', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id', 'userId'],
            distinct: ['id', 'userId'],
          }),
        TypeError,
        'exactly one column',
      );
    });

    it('invalid: non-string element', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id'],
            distinct: [42],
          }),
        TypeError,
        "'distinct[0]' must be a non-empty string",
      );
    });

    it('invalid: empty-string element', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id'],
            distinct: [''],
          }),
        TypeError,
        "'distinct[0]' must be a non-empty string",
      );
    });

    it('invalid: whitespace-only element', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id'],
            distinct: ['   '],
          }),
        TypeError,
        "'distinct[0]' must be a non-empty string",
      );
    });

    it('invalid: @-prefixed column', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id'],
            distinct: ['@id'],
          }),
        TypeError,
        "without '@' prefix",
      );
    });

    it('invalid: column not declared', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'orders',
            columns: ['id'],
            distinct: ['ghost'],
          }),
        TypeError,
        'does not exist in columns',
      );
    });
  });

  describe('where with $exists', () => {
    it('valid: $exists subquery filter', () => {
      assertCountQuery({
        type: 'COUNT',
        table: 'users',
        columns: ['id'],
        where: {
          $exists: { table: 'orders', on: { '@userId': '@id' } },
        },
      });
    });

    it('invalid: malformed $nexists spec', () => {
      asserts.assertThrows(
        () =>
          assertCountQuery({
            type: 'COUNT',
            table: 'users',
            columns: ['id'],
            where: { $nexists: { on: { '@userId': '@id' } } },
          }),
        TypeError,
        "'$nexists' is invalid",
      );
    });
  });

  describe('invalid WHERE', () => {
    it('WHERE structure', () => {
      asserts.assertThrows(
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
  });

  describe('isCountQuery type guard', () => {
    it('should return true for valid COUNT query', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'status'],
      };
      asserts.assertEquals(isCountQuery(query), true);
    });

    it('should return false for invalid queries', () => {
      asserts.assertEquals(isCountQuery(null), false);
      asserts.assertEquals(isCountQuery(undefined), false);
      asserts.assertEquals(isCountQuery(123), false);
      asserts.assertEquals(isCountQuery('COUNT'), false);
      asserts.assertEquals(isCountQuery([]), false);
      asserts.assertEquals(isCountQuery({}), false);
      asserts.assertEquals(
        isCountQuery({ type: 'SELECT', table: 'users' }),
        false,
      );
    });

    it('should narrow type correctly', () => {
      const query: unknown = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'status'],
      };

      if (isCountQuery(query)) {
        asserts.assertEquals(query.type, 'COUNT');
        asserts.assertEquals(query.table, 'users');
        asserts.assert(Array.isArray(query.columns));
      }
    });
  });
});

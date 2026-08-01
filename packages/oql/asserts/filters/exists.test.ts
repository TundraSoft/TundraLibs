/**
 * ExistsFilter Validator Tests
 *
 * Test suite for the `$exists` / `$nexists` subquery-filter validator.
 *
 * @module asserts/Filters/Exists
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertExistsFilter, isExistsFilter } from './exists.ts';

describe('oql.asserts.Filters.Exists', () => {
  describe('assertExistsFilter', () => {
    describe('valid filters', () => {
      it('minimal: table + single on-ref', () => {
        assertExistsFilter({
          table: 'orders',
          on: { '@userId': '@id' },
        });
      });

      it('with schema', () => {
        assertExistsFilter({
          table: 'bans',
          schema: 'audit',
          on: { '@userId': '@id' },
        });
      });

      it('with literal on values (string, number, boolean, bigint, Date, null)', () => {
        assertExistsFilter({
          table: 'orders',
          on: {
            '@userId': '@id',
            '@kind': 'subscription',
            '@total': 100,
            '@active': true,
            '@big': 10n,
            '@createdAt': new Date('2024-01-01'),
            '@deletedAt': null,
          },
        });
      });

      it('with subquery-local where', () => {
        assertExistsFilter({
          table: 'orders',
          on: { '@userId': '@id' },
          where: { '@status': { $in: ['paid', 'shipped'] } },
        });
      });

      it('with nested $and/$or in where', () => {
        assertExistsFilter({
          table: 'orders',
          on: { '@userId': '@id' },
          where: {
            $or: [
              { '@status': 'paid' },
              { '@total': { $gte: 100 } },
            ],
          },
        });
      });

      it('with a nested $exists inside where', () => {
        assertExistsFilter({
          table: 'orders',
          on: { '@userId': '@id' },
          where: {
            $exists: { table: 'refunds', on: { '@orderId': 1 } },
          },
        });
      });
    });

    describe('invalid shape', () => {
      it('null', () => {
        asserts.assertThrows(
          () => assertExistsFilter(null),
          TypeError,
          'Expected an object',
        );
      });

      it('array', () => {
        asserts.assertThrows(
          () => assertExistsFilter([{ table: 'orders', on: { '@a': 1 } }]),
          TypeError,
          'Expected an object, got array',
        );
      });

      it('string', () => {
        asserts.assertThrows(
          () => assertExistsFilter('orders'),
          TypeError,
          'Expected an object',
        );
      });
    });

    describe('invalid table / schema', () => {
      it('missing table', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ on: { '@userId': '@id' } }),
          TypeError,
          "Missing required 'table'",
        );
      });

      it('empty table', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ table: '', on: { '@userId': '@id' } }),
          TypeError,
          "'table' must be a non-empty string",
        );
      });

      it('non-string table', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ table: 42, on: { '@userId': '@id' } }),
          TypeError,
          "'table' must be a non-empty string",
        );
      });

      it('empty schema', () => {
        asserts.assertThrows(
          () =>
            assertExistsFilter({
              table: 'orders',
              schema: '',
              on: { '@userId': '@id' },
            }),
          TypeError,
          "'schema' must be a non-empty string",
        );
      });
    });

    describe('invalid on', () => {
      it('missing on', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ table: 'orders' }),
          TypeError,
          "Missing required 'on'",
        );
      });

      it('non-object on', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ table: 'orders', on: '@userId' }),
          TypeError,
          "'on' must be an object",
        );
      });

      it('array on', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ table: 'orders', on: ['@userId'] }),
          TypeError,
          "'on' must be an object, got array",
        );
      });

      it('empty on', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ table: 'orders', on: {} }),
          TypeError,
          "'on' cannot be empty",
        );
      });

      it('on key without @ prefix', () => {
        asserts.assertThrows(
          () => assertExistsFilter({ table: 'orders', on: { userId: '@id' } }),
          TypeError,
          'not a valid column identifier',
        );
      });

      it('on key with alias segment (must be single-segment)', () => {
        asserts.assertThrows(
          () =>
            assertExistsFilter({
              table: 'orders',
              on: { '@o.@userId': '@id' },
            }),
          TypeError,
          'single-segment',
        );
      });

      it('on value expression object rejected', () => {
        asserts.assertThrows(
          () =>
            assertExistsFilter({
              table: 'orders',
              on: {
                '@userId': { $$_expression: 'ADD', args: ['@id', 1] },
              },
            }),
          TypeError,
          'cannot be an expression',
        );
      });

      it('on value array rejected', () => {
        asserts.assertThrows(
          () =>
            assertExistsFilter({ table: 'orders', on: { '@userId': [1, 2] } }),
          TypeError,
          "'on' value for key '@userId' must be null, a primitive value",
        );
      });

      it('on value plain object rejected', () => {
        asserts.assertThrows(
          () =>
            assertExistsFilter({
              table: 'orders',
              on: { '@userId': { some: 'object' } },
            }),
          TypeError,
          "'on' value for key '@userId' must be null, a primitive value",
        );
      });
    });

    describe('invalid where', () => {
      it('non-object where', () => {
        asserts.assertThrows(
          () =>
            assertExistsFilter({
              table: 'orders',
              on: { '@userId': '@id' },
              where: 'status = paid',
            }),
          TypeError,
          "'where' is invalid",
        );
      });

      it('empty where', () => {
        asserts.assertThrows(
          () =>
            assertExistsFilter({
              table: 'orders',
              on: { '@userId': '@id' },
              where: {},
            }),
          TypeError,
          "'where' is invalid",
        );
      });

      it('where nesting counts against the shared depth budget', () => {
        // Build a $exists chain deeper than the default max depth of 10.
        let filter: Record<string, unknown> = {
          table: 't',
          on: { '@a': 1 },
        };
        for (let i = 0; i < 12; i++) {
          filter = {
            table: 't',
            on: { '@a': 1 },
            where: { $exists: filter },
          };
        }
        asserts.assertThrows(
          () => assertExistsFilter(filter),
          TypeError,
          'maximum nesting depth',
        );
      });
    });
  });

  describe('isExistsFilter type guard', () => {
    it('returns true for valid filters', () => {
      asserts.assertEquals(
        isExistsFilter({ table: 'orders', on: { '@userId': '@id' } }),
        true,
      );
    });

    it('returns false for invalid filters', () => {
      asserts.assertEquals(isExistsFilter(null), false);
      asserts.assertEquals(isExistsFilter(undefined), false);
      asserts.assertEquals(isExistsFilter({}), false);
      asserts.assertEquals(isExistsFilter({ table: 'orders' }), false);
      asserts.assertEquals(
        isExistsFilter({ table: 'orders', on: {} }),
        false,
      );
    });

    it('narrows type correctly', () => {
      const x: unknown = { table: 'orders', on: { '@userId': '@id' } };
      if (isExistsFilter(x)) {
        asserts.assertEquals(x.table, 'orders');
      }
    });
  });
});

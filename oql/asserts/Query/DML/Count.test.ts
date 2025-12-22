/**
 * COUNT Query Validator Tests
 *
 * Comprehensive test suite for the COUNT query validator.
 *
 * @module asserts/Query/DML/Count
 */

import * as asserts from '$asserts';
import { assertCountQuery } from './Count.ts';

Deno.test('oql.asserts.Query.DML.Count', async (t) => {
  await t.step('valid queries', async (u) => {
    await u.step('simple query', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'status'],
      };
      assertCountQuery(query);
    });

    await u.step('with schema', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'status'],
      };
      assertCountQuery(query);
    });

    await u.step('with WHERE', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'status', 'createdAt'],
        where: { '@status': 'active' },
      };
      assertCountQuery(query);
    });

    await u.step('with complex WHERE', () => {
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

    await u.step('with IN operator', () => {
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

    await u.step('with comparison operators', () => {
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

    await u.step('with NULL check', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['id', 'deletedAt'],
        where: { '@deletedAt': { $null: false } },
      };
      assertCountQuery(query);
    });

    await u.step('with pre-declared expression', () => {
      const query = {
        type: 'COUNT',
        table: 'orders',
        columns: ['id', 'userId', 'status', 'total', 'discount'],
        expressions: {
          'finalPrice': { type: 'SUBTRACT', args: ['@total', '@discount'] },
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

    await u.step('with multiple expressions', () => {
      const query = {
        type: 'COUNT',
        table: 'users',
        columns: ['firstName', 'lastName', 'age', 'status'],
        expressions: {
          'fullName': {
            type: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
          'ageText': { type: 'CONCAT', args: ['Age: ', '@age'] },
        },
        where: {
          '@fullName': { $like: 'John%' },
          '@age': { $gte: 18 },
          '@status': 'active',
        },
      };
      assertCountQuery(query);
    });

    await u.step('with nested expression', () => {
      const query = {
        type: 'COUNT',
        table: 'products',
        columns: ['id', 'price', 'tax', 'discount'],
        expressions: {
          'finalPrice': {
            type: 'SUBTRACT',
            args: [
              { type: 'ADD', args: ['@price', '@tax'] },
              '@discount',
            ],
          },
        },
        where: { '@finalPrice': { $gte: 50 } },
      };
      assertCountQuery(query);
    });
  });

  await t.step('invalid type', async (u) => {
    await u.step('null', () => {
      asserts.assertThrows(
        () => assertCountQuery(null),
        TypeError,
        'Expected object',
      );
    });

    await u.step('boolean', () => {
      asserts.assertThrows(
        () => assertCountQuery(true),
        TypeError,
        'Expected object',
      );
    });

    await u.step('wrong type', () => {
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

  await t.step('invalid table', async (u) => {
    await u.step('missing table', () => {
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

    await u.step('empty table', () => {
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

    await u.step('empty schema', () => {
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

  await t.step('invalid columns', async (u) => {
    await u.step('missing columns', () => {
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

    await u.step('empty columns', () => {
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

    await u.step('column with @ prefix', () => {
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

    await u.step('empty column string', () => {
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

    await u.step('non-string column', () => {
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

    await u.step('non-array columns', () => {
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

  await t.step('invalid WHERE', async (u) => {
    await u.step('WHERE structure', () => {
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
});

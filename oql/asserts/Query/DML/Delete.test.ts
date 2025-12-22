/**
 * DELETE Query Validator Tests
 *
 * Comprehensive test suite for the DELETE query validator.
 *
 * @module asserts/Query/DML/Delete
 */

import * as asserts from '$asserts';
import { assertDeleteQuery } from './Delete.ts';

Deno.test('oql.asserts.Query.DML.Delete', async (t) => {
  await t.step('valid queries', async (u) => {
    await u.step('simple query', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'status'],
        where: { '@status': 'inactive' },
      };
      assertDeleteQuery(query);
    });

    await u.step('with schema', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        schema: 'public',
        columns: ['id', 'status'],
        where: { '@status': 'inactive' },
      };
      assertDeleteQuery(query);
    });

    await u.step('with complex WHERE', () => {
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

    await u.step('without WHERE (delete all)', () => {
      const query = {
        type: 'DELETE',
        table: 'temp_data',
        columns: ['id', 'data'],
      };
      assertDeleteQuery(query);
    });

    await u.step('with date comparison', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        schema: 'archive',
        columns: ['id', 'deletedAt'],
        where: { '@deletedAt': { $lt: new Date('2023-01-01') } },
      };
      assertDeleteQuery(query);
    });

    await u.step('with IN operator', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'status'],
        where: { '@status': { $in: ['deleted', 'banned'] } },
      };
      assertDeleteQuery(query);
    });

    await u.step('with NULL operator', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'lastLogin'],
        where: { '@lastLogin': { $null: true } },
      };
      assertDeleteQuery(query);
    });

    await u.step('with pre-declared expression', () => {
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

    await u.step('with multiple expressions', () => {
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

    await u.step('with expression in complex WHERE', () => {
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
  });

  await t.step('invalid type', async (u) => {
    await u.step('null', () => {
      asserts.assertThrows(
        () => assertDeleteQuery(null),
        TypeError,
        'Expected object',
      );
    });

    await u.step('undefined', () => {
      asserts.assertThrows(
        () => assertDeleteQuery(undefined),
        TypeError,
        'Expected object',
      );
    });

    await u.step('wrong type', () => {
      asserts.assertThrows(
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

    await u.step('missing type', () => {
      asserts.assertThrows(
        () =>
          assertDeleteQuery({
            table: 'users',
            columns: ['id'],
          }),
        TypeError,
        'DELETE',
      );
    });
  });

  await t.step('invalid table', async (u) => {
    await u.step('missing table', () => {
      asserts.assertThrows(
        () =>
          assertDeleteQuery({
            type: 'DELETE',
            columns: ['id'],
          }),
        TypeError,
        'table',
      );
    });

    await u.step('empty table', () => {
      asserts.assertThrows(
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

    await u.step('empty schema', () => {
      asserts.assertThrows(
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
  });

  await t.step('invalid columns', async (u) => {
    await u.step('missing columns', () => {
      asserts.assertThrows(
        () =>
          assertDeleteQuery({
            type: 'DELETE',
            table: 'users',
          }),
        TypeError,
        'columns',
      );
    });

    await u.step('empty columns', () => {
      asserts.assertThrows(
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

    await u.step('column with @ prefix', () => {
      asserts.assertThrows(
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

    await u.step('empty column string', () => {
      asserts.assertThrows(
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

    await u.step('non-array columns', () => {
      asserts.assertThrows(
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
  });
});

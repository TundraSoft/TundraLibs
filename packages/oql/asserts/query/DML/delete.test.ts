/**
 * DELETE Query Validator Tests
 *
 * Comprehensive test suite for the DELETE query validator.
 *
 * @module asserts/Query/DML/Delete
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertDeleteQuery, isDeleteQuery } from './delete.ts';

describe('oql.asserts.Query.DML.Delete', () => {
  describe('valid queries', () => {
    it('simple query', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'status'],
        where: { '@status': 'inactive' },
      };
      assertDeleteQuery(query);
    });

    it('with schema', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        schema: 'public',
        columns: ['id', 'status'],
        where: { '@status': 'inactive' },
      };
      assertDeleteQuery(query);
    });

    it('with complex WHERE', () => {
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

    it('without WHERE (delete all)', () => {
      const query = {
        type: 'DELETE',
        table: 'temp_data',
        columns: ['id', 'data'],
      };
      assertDeleteQuery(query);
    });

    it('with date comparison', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        schema: 'archive',
        columns: ['id', 'deletedAt'],
        where: { '@deletedAt': { $lt: new Date('2023-01-01') } },
      };
      assertDeleteQuery(query);
    });

    it('with IN operator', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'status'],
        where: { '@status': { $in: ['deleted', 'banned'] } },
      };
      assertDeleteQuery(query);
    });

    it('with NULL operator', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'lastLogin'],
        where: { '@lastLogin': { $null: true } },
      };
      assertDeleteQuery(query);
    });

    it('with pre-declared expression', () => {
      const query = {
        type: 'DELETE',
        table: 'logs',
        columns: ['id', 'createdAt', 'level', 'size'],
        expressions: {
          'doubleSize': { $$_expression: 'MULTIPLY', args: ['@size', 2] },
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

    it('with multiple expressions', () => {
      const query = {
        type: 'DELETE',
        table: 'temp_data',
        columns: ['id', 'createdAt', 'accessCount', 'size'],
        expressions: {
          'totalSize': {
            $$_expression: 'ADD',
            args: ['@size', '@accessCount'],
          },
          'doubleAccess': {
            $$_expression: 'MULTIPLY',
            args: ['@accessCount', 2],
          },
        },
        where: {
          '@totalSize': { $gte: 1000 },
          '@accessCount': { $eq: 0 },
        },
      };
      assertDeleteQuery(query);
    });

    it('with expression in complex WHERE', () => {
      const query = {
        type: 'DELETE',
        table: 'products',
        columns: ['id', 'price', 'tax', 'inStock'],
        expressions: {
          'totalCost': { $$_expression: 'ADD', args: ['@price', '@tax'] },
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

  describe('invalid type', () => {
    it('null', () => {
      asserts.assertThrows(
        () => assertDeleteQuery(null),
        TypeError,
        'Expected object',
      );
    });

    it('undefined', () => {
      asserts.assertThrows(
        () => assertDeleteQuery(undefined),
        TypeError,
        'Expected object',
      );
    });

    it('wrong type', () => {
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

    it('missing type', () => {
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

  describe('invalid table', () => {
    it('missing table', () => {
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

    it('empty table', () => {
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

    it('empty schema', () => {
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

  describe('invalid columns', () => {
    it('missing columns', () => {
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

    it('empty columns', () => {
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

    it('column with @ prefix', () => {
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

    it('empty column string', () => {
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

    it('non-array columns', () => {
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

  describe('isDeleteQuery', () => {
    it('should return true for valid DELETE query', () => {
      const query = {
        type: 'DELETE',
        table: 'users',
        columns: ['id', 'status'],
        where: { '@id': 1 },
      };
      asserts.assert(isDeleteQuery(query));
    });

    it('should return false for null', () => {
      asserts.assert(!isDeleteQuery(null));
    });

    it('should return false for wrong type', () => {
      asserts.assert(
        !isDeleteQuery({
          type: 'SELECT',
          table: 'users',
          columns: ['id'],
        }),
      );
    });

    it('should return false for missing table', () => {
      asserts.assert(
        !isDeleteQuery({
          type: 'DELETE',
          columns: ['id'],
        }),
      );
    });

    it('should return false for missing columns', () => {
      asserts.assert(
        !isDeleteQuery({
          type: 'DELETE',
          table: 'users',
        }),
      );
    });
  });
});

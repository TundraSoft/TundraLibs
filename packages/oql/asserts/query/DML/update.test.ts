/**
 * UPDATE Query Validator Tests
 *
 * Comprehensive test suite for the UPDATE query validator.
 *
 * @module asserts/Query/DML/Update
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertUpdateQuery, isUpdateQuery } from './update.ts';

describe('oql.asserts.Query.DML.Update', () => {
  describe('valid queries', () => {
    it('simple query', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name', 'email'],
        data: { email: 'newemail@example.com' },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    it('with schema', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        schema: 'public',
        columns: ['id', 'name'],
        data: { name: 'Jane' },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    it('with expression', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name', 'updatedAt'],
        data: {
          name: 'Jane Doe',
          updatedAt: { $$_expression: 'NOW' },
        },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    it('with multiple expressions', () => {
      const query = {
        type: 'UPDATE',
        table: 'products',
        columns: ['id', 'price', 'discount', 'updatedAt'],
        data: {
          price: { $$_expression: 'MULTIPLY', args: ['@price', 0.9] },
          updatedAt: { $$_expression: 'NOW' },
        },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    it('without WHERE (update all)', () => {
      const query = {
        type: 'UPDATE',
        table: 'settings',
        columns: ['key', 'value', 'lastSync'],
        data: { lastSync: { $$_expression: 'NOW' } },
      };
      assertUpdateQuery(query);
    });

    it('with complex WHERE', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'status', 'lastLogin'],
        data: { status: 'inactive' },
        where: {
          '@status': 'active',
          '@lastLogin': { $lt: new Date('2023-01-01') },
        },
      };
      assertUpdateQuery(query);
    });

    it('with pre-declared expression', () => {
      const query = {
        type: 'UPDATE',
        table: 'products',
        columns: ['id', 'price', 'tax', 'discount'],
        expressions: {
          'totalPrice': { $$_expression: 'ADD', args: ['@price', '@tax'] },
        },
        data: { discount: 10 },
        where: { '@totalPrice': { $gt: 100 } },
      };
      assertUpdateQuery(query);
    });

    it('with multiple pre-declared expressions', () => {
      const query = {
        type: 'UPDATE',
        table: 'orders',
        columns: ['id', 'subtotal', 'tax', 'discount', 'status'],
        expressions: {
          'total': { $$_expression: 'ADD', args: ['@subtotal', '@tax'] },
          'final': {
            $$_expression: 'SUBTRACT',
            args: ['@subtotal', '@discount'],
          },
        },
        data: { status: 'processed' },
        where: {
          '@total': { $gte: 50 },
          '@final': { $lte: 200 },
        },
      };
      assertUpdateQuery(query);
    });

    it('with expression in WHERE only', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['firstName', 'lastName', 'status'],
        expressions: {
          'fullName': {
            $$_expression: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
        },
        data: { status: 'verified' },
        where: { '@fullName': { $like: 'John%' } },
      };
      assertUpdateQuery(query);
    });

    it('with null value', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { bio: null },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    it('with all data types', () => {
      const query = {
        type: 'UPDATE',
        table: 'test_data',
        columns: ['id', 'name', 'age', 'active', 'updatedAt'],
        data: {
          name: 'Test',
          age: 26,
          active: false,
          updatedAt: { $$_expression: 'NOW' },
        },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });
  });

  describe('invalid type', () => {
    it('null', () => {
      asserts.assertThrows(
        () => assertUpdateQuery(null),
        TypeError,
        'Expected object',
      );
    });

    it('non-object', () => {
      asserts.assertThrows(
        () => assertUpdateQuery(123),
        TypeError,
        'Expected object',
      );
    });

    it('wrong type', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        "Expected type 'UPDATE'",
      );
    });
  });

  describe('invalid table', () => {
    it('missing table', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        'table',
      );
    });

    it('empty table', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: '',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty string',
      );
    });

    it('empty schema', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            schema: '',
            columns: ['id'],
            data: { id: 1 },
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
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            data: { name: 'John' },
          }),
        TypeError,
        'columns',
      );
    });

    it('empty columns array', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: [],
            data: { name: 'John' },
          }),
        TypeError,
        'non-empty array',
      );
    });

    it('column with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['@id', 'name'],
            data: { name: 'John' },
          }),
        TypeError,
        "without '@' prefix",
      );
    });

    it('non-string column element', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['id', 123],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty string',
      );
    });

    it('empty column element', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['id', ''],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty string',
      );
    });
  });

  describe('invalid data', () => {
    it('missing data', () => {
      asserts.assertThrows(
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
    });

    it('null data', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['id', 'name'],
            data: null,
            where: { '@id': 1 },
          }),
        TypeError,
        'must be a non-null object',
      );
    });

    it('empty data object', () => {
      asserts.assertThrows(
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
    });

    it('data as array', () => {
      asserts.assertThrows(
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

    it('data key with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['id', 'name'],
            data: { '@name': 'John' },
            where: { '@id': 1 },
          }),
        TypeError,
        'is not in columns list',
      );
    });

    it('data key not in columns', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['id', 'name'],
            data: { name: 'John', age: 30 },
            where: { '@id': 1 },
          }),
        TypeError,
        'not in columns list',
      );
    });

    it('invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['id', 'name', 'updatedAt'],
            data: {
              name: 'John',
              updatedAt: { $$_expression: 'INVALID_TYPE' },
            },
            where: { '@id': 1 },
          }),
        TypeError,
        'invalid expression',
      );
    });
  });

  describe('isUpdateQuery type guard', () => {
    it('should return true for valid UPDATE query', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: { name: 'John' },
      };
      asserts.assertEquals(isUpdateQuery(query), true);
    });

    it('should return false for invalid queries', () => {
      asserts.assertEquals(isUpdateQuery(null), false);
      asserts.assertEquals(isUpdateQuery(undefined), false);
      asserts.assertEquals(isUpdateQuery(123), false);
      asserts.assertEquals(isUpdateQuery('UPDATE'), false);
      asserts.assertEquals(isUpdateQuery([]), false);
      asserts.assertEquals(isUpdateQuery({}), false);
      asserts.assertEquals(
        isUpdateQuery({ type: 'SELECT', table: 'users' }),
        false,
      );
      asserts.assertEquals(
        isUpdateQuery({ type: 'UPDATE', table: '' }),
        false,
      );
      asserts.assertEquals(
        isUpdateQuery({ type: 'UPDATE', table: 'users' /* missing columns */ }),
        false,
      );
    });

    it('should narrow type correctly', () => {
      const query: unknown = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name'],
        data: { name: 'John' },
      };

      if (isUpdateQuery(query)) {
        // Type is narrowed to UpdateQuery
        asserts.assertEquals(query.type, 'UPDATE');
        asserts.assertEquals(query.table, 'users');
        asserts.assert(Array.isArray(query.columns));
        asserts.assert(typeof query.data === 'object');
      }
    });
  });
});

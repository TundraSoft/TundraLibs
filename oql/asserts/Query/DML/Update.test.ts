/**
 * UPDATE Query Validator Tests
 *
 * Comprehensive test suite for the UPDATE query validator.
 *
 * @module asserts/Query/DML/Update
 */

import * as asserts from '$asserts';
import { assertUpdateQuery } from './Update.ts';

Deno.test('oql.asserts.Query.DML.Update', async (t) => {
  await t.step('valid queries', async (u) => {
    await u.step('simple query', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name', 'email'],
        data: { email: 'newemail@example.com' },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    await u.step('with schema', () => {
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

    await u.step('with expression', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name', 'updatedAt'],
        data: {
          name: 'Jane Doe',
          updatedAt: { type: 'NOW' },
        },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    await u.step('with multiple expressions', () => {
      const query = {
        type: 'UPDATE',
        table: 'products',
        columns: ['id', 'price', 'discount', 'updatedAt'],
        data: {
          price: { type: 'MULTIPLY', args: ['@price', 0.9] },
          updatedAt: { type: 'NOW' },
        },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    await u.step('without WHERE (update all)', () => {
      const query = {
        type: 'UPDATE',
        table: 'settings',
        columns: ['key', 'value', 'lastSync'],
        data: { lastSync: { type: 'NOW' } },
      };
      assertUpdateQuery(query);
    });

    await u.step('with complex WHERE', () => {
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

    await u.step('with pre-declared expression', () => {
      const query = {
        type: 'UPDATE',
        table: 'products',
        columns: ['id', 'price', 'tax', 'discount'],
        expressions: {
          'totalPrice': { type: 'ADD', args: ['@price', '@tax'] },
        },
        data: { discount: 10 },
        where: { '@totalPrice': { $gt: 100 } },
      };
      assertUpdateQuery(query);
    });

    await u.step('with multiple pre-declared expressions', () => {
      const query = {
        type: 'UPDATE',
        table: 'orders',
        columns: ['id', 'subtotal', 'tax', 'discount', 'status'],
        expressions: {
          'total': { type: 'ADD', args: ['@subtotal', '@tax'] },
          'final': { type: 'SUBTRACT', args: ['@subtotal', '@discount'] },
        },
        data: { status: 'processed' },
        where: {
          '@total': { $gte: 50 },
          '@final': { $lte: 200 },
        },
      };
      assertUpdateQuery(query);
    });

    await u.step('with expression in WHERE only', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['firstName', 'lastName', 'status'],
        expressions: {
          'fullName': {
            type: 'CONCAT',
            args: ['@firstName', ' ', '@lastName'],
          },
        },
        data: { status: 'verified' },
        where: { '@fullName': { $like: 'John%' } },
      };
      assertUpdateQuery(query);
    });

    await u.step('with null value', () => {
      const query = {
        type: 'UPDATE',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { bio: null },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });

    await u.step('with all data types', () => {
      const query = {
        type: 'UPDATE',
        table: 'test_data',
        columns: ['id', 'name', 'age', 'active', 'updatedAt'],
        data: {
          name: 'Test',
          age: 26,
          active: false,
          updatedAt: { type: 'NOW' },
        },
        where: { '@id': 1 },
      };
      assertUpdateQuery(query);
    });
  });

  await t.step('invalid type', async (u) => {
    await u.step('null', () => {
      asserts.assertThrows(
        () => assertUpdateQuery(null),
        TypeError,
        'Expected object',
      );
    });

    await u.step('non-object', () => {
      asserts.assertThrows(
        () => assertUpdateQuery(123),
        TypeError,
        'Expected object',
      );
    });

    await u.step('wrong type', () => {
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

  await t.step('invalid table', async (u) => {
    await u.step('missing table', () => {
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

    await u.step('empty table', () => {
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

    await u.step('empty schema', () => {
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

  await t.step('invalid columns', async (u) => {
    await u.step('missing columns', () => {
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

    await u.step('empty columns array', () => {
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

    await u.step('column with @ prefix', () => {
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

    await u.step('non-string column element', () => {
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

    await u.step('empty column element', () => {
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

  await t.step('invalid data', async (u) => {
    await u.step('missing data', () => {
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

    await u.step('null data', () => {
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

    await u.step('empty data object', () => {
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

    await u.step('data as array', () => {
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

    await u.step('data key with @ prefix', () => {
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

    await u.step('data key not in columns', () => {
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

    await u.step('invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertUpdateQuery({
            type: 'UPDATE',
            table: 'users',
            columns: ['id', 'name', 'updatedAt'],
            data: {
              name: 'John',
              updatedAt: { type: 'INVALID_TYPE' },
            },
            where: { '@id': 1 },
          }),
        TypeError,
        'invalid expression',
      );
    });
  });
});

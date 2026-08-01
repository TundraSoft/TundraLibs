/**
 * INSERT Query Validator Tests
 *
 * Comprehensive test suite for INSERT query validator.
 *
 * @module asserts/Query/DML/Insert.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertInsertQuery, isInsertQuery } from './insert.ts';

describe('oql.asserts.Query.DML.Insert', () => {
  describe('valid queries', () => {
    it('simple query', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'email'],
        data: { id: 1, name: 'John Doe', email: 'john@example.com' },
      };
      assertInsertQuery(query);
    });

    it('with schema', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        schema: 'public',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
      };
      assertInsertQuery(query);
    });

    it('with expression', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        data: {
          id: 1,
          name: 'John',
          createdAt: { $$_expression: 'NOW' },
        },
      };
      assertInsertQuery(query);
    });

    it('with multiple expressions', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt', 'updatedAt'],
        data: {
          id: 1,
          name: 'John',
          createdAt: { $$_expression: 'NOW' },
          updatedAt: { $$_expression: 'NOW' },
        },
      };
      assertInsertQuery(query);
    });

    it('with null value', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { id: 1, name: 'John', bio: null },
      };
      assertInsertQuery(query);
    });

    it('with undefined value', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'bio'],
        data: { id: 1, name: 'John', bio: undefined },
      };
      assertInsertQuery(query);
    });

    it('with Date value', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'birthDate'],
        data: { id: 1, name: 'John', birthDate: '1990-01-01' },
      };
      assertInsertQuery(query);
    });

    it('bulk insert (array)', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
      };
      assertInsertQuery(query);
    });

    it('bulk with expressions', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'createdAt'],
        data: [
          { id: 1, name: 'John', createdAt: { $$_expression: 'NOW' } },
          { id: 2, name: 'Jane', createdAt: { $$_expression: 'NOW' } },
        ],
      };
      assertInsertQuery(query);
    });

    it('with all data types', () => {
      const query = {
        type: 'INSERT',
        table: 'test_data',
        columns: ['id', 'name', 'age', 'active', 'createdAt'],
        data: {
          id: 1,
          name: 'Test',
          age: 25,
          active: true,
          createdAt: { $$_expression: 'NOW' },
        },
      };
      assertInsertQuery(query);
    });
  });

  describe('invalid type', () => {
    it('null', () => {
      asserts.assertThrows(
        () => assertInsertQuery(null),
        TypeError,
        'Expected object',
      );
    });

    it('non-object', () => {
      asserts.assertThrows(
        () => assertInsertQuery('not an object'),
        TypeError,
        'Expected object',
      );
    });

    it('wrong type', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        "Expected type 'INSERT'",
      );
    });
  });

  describe('invalid table', () => {
    it('missing table', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
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
          assertInsertQuery({
            type: 'INSERT',
            table: '',
            columns: ['id'],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty string',
      );
    });
  });

  describe('invalid schema', () => {
    it('empty schema', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
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
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            data: { id: 1 },
          }),
        TypeError,
        'columns',
      );
    });

    it('empty columns array', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: [],
            data: { id: 1 },
          }),
        TypeError,
        'non-empty array',
      );
    });

    it('column with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['@id', 'name'],
            data: { id: 1, name: 'John' },
          }),
        TypeError,
        "without '@' prefix",
      );
    });

    it('non-string column element', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
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
          assertInsertQuery({
            type: 'INSERT',
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
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
          }),
        TypeError,
        "data' is required",
      );
    });

    it('null data', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: null,
          }),
        TypeError,
        "data' is required",
      );
    });

    it('empty data array', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: [],
          }),
        TypeError,
        'cannot be an empty array',
      );
    });

    it('non-object data', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id'],
            data: 'not an object',
          }),
        TypeError,
        'must be an object',
      );
    });

    it('empty data object', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: {},
          }),
        TypeError,
        'cannot be empty',
      );
    });

    it('data key not in columns', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { id: 1, name: 'John', age: 30 },
          }),
        TypeError,
        'not in columns list',
      );
    });

    it('data key with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: { '@id': 1, name: 'John' },
          }),
        TypeError,
        'is not in columns list',
      );
    });

    it('data value: object without `type` accepted as literal payload (JSON column)', () => {
      // Objects without a `type` discriminator are passed through as
      // literal payloads — typical case for JSON / JSONB columns.
      assertInsertQuery({
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name', 'data'],
        data: { id: 1, name: 'John', data: { nested: 'object' } },
      });
    });

    it('data value: object with bogus `$$_expression` still rejected', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'data'],
            data: {
              id: 1,
              data: { $$_expression: 'NOT_A_REAL_EXPRESSION', args: [] },
            },
          }),
        TypeError,
        'invalid expression',
      );
    });

    it('bulk insert with invalid item', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name'],
            data: [
              { id: 1, name: 'John' },
              null,
            ],
          }),
        TypeError,
        'must be an object',
      );
    });
  });

  describe('invalid expressions', () => {
    it('expression with column reference', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['firstName', 'lastName', 'fullName'],
            data: {
              firstName: 'John',
              lastName: 'Doe',
              fullName: {
                $$_expression: 'CONCAT',
                args: ['@firstName', ' ', '@lastName'],
              },
            },
          }),
        TypeError,
        'Column references',
      );
    });

    it('invalid expression', () => {
      asserts.assertThrows(
        () =>
          assertInsertQuery({
            type: 'INSERT',
            table: 'users',
            columns: ['id', 'name', 'createdAt'],
            data: {
              id: 1,
              name: 'John',
              createdAt: { $$_expression: 'INVALID_TYPE' },
            },
          }),
        TypeError,
        'invalid expression',
      );
    });
  });

  describe('isInsertQuery', () => {
    it('should return true for valid INSERT query', () => {
      const query = {
        type: 'INSERT',
        table: 'users',
        columns: ['id', 'name'],
        data: { id: 1, name: 'John' },
      };
      asserts.assert(isInsertQuery(query));
    });

    it('should return false for null', () => {
      asserts.assert(!isInsertQuery(null));
    });

    it('should return false for wrong type', () => {
      asserts.assert(
        !isInsertQuery({
          type: 'SELECT',
          table: 'users',
          columns: ['id'],
        }),
      );
    });

    it('should return false for missing table', () => {
      asserts.assert(
        !isInsertQuery({
          type: 'INSERT',
          columns: ['id'],
          data: { id: 1 },
        }),
      );
    });

    it('should return false for missing data', () => {
      asserts.assert(
        !isInsertQuery({
          type: 'INSERT',
          table: 'users',
          columns: ['id'],
        }),
      );
    });
  });
});

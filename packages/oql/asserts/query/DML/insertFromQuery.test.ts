import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertInsertFromQuery, isInsertFromQuery } from './insertFromQuery.ts';

// A small helper that builds a syntactically-valid SELECT for use as
// the source of an INSERT_FROM_QUERY in tests.
const buildSelect = (
  projection: Record<string, unknown>,
): Record<string, unknown> => ({
  type: 'SELECT',
  table: 'orders',
  columns: ['id', 'userId', 'total', 'status'],
  projection,
});

describe('oql.asserts.Query.DML.InsertFromQuery', () => {
  describe('assertInsertFromQuery', () => {
    it('valid: minimal insert from query', () => {
      assertInsertFromQuery({
        type: 'INSERT_FROM_QUERY',
        table: 'order_history',
        columns: ['id', 'userId', 'total'],
        query: buildSelect({
          '@id': true,
          '@userId': true,
          '@total': true,
        }),
      });
    });

    it('valid: with schema', () => {
      assertInsertFromQuery({
        type: 'INSERT_FROM_QUERY',
        table: 'order_history',
        schema: 'public',
        columns: ['id', 'userId', 'total'],
        query: buildSelect({
          '@id': true,
          '@userId': true,
          '@total': true,
        }),
      });
    });

    it('valid: projection key is an alias for a source column', () => {
      // The SELECT's projection keys must be valid column references
      // in the SELECT's own scope, not the target's. Here `@id` /
      // `@status` exist in the source `orders` table.
      assertInsertFromQuery({
        type: 'INSERT_FROM_QUERY',
        table: 'audit',
        columns: ['orderId', 'lastStatus'],
        query: buildSelect({
          '@id': true,
          '@status': true,
        }),
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertInsertFromQuery('not-an-object'),
        TypeError,
        'Expected object',
      );
      asserts.assertThrows(
        () => assertInsertFromQuery(null),
        TypeError,
        'Expected object',
      );
      asserts.assertThrows(
        () => assertInsertFromQuery(undefined),
        TypeError,
        'Expected object',
      );
      asserts.assertThrows(
        () => assertInsertFromQuery(42),
        TypeError,
        'Expected object',
      );
      asserts.assertThrows(
        () => assertInsertFromQuery([]),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT',
            table: 'audit',
            columns: ['id'],
            query: buildSelect({ '@id': true }),
          }),
        TypeError,
        "Expected type 'INSERT_FROM_QUERY'",
      );
    });

    it('invalid: missing table', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT_FROM_QUERY',
            columns: ['id'],
            query: buildSelect({ '@id': true }),
          }),
        TypeError,
        "'table' is required",
      );
    });

    it('invalid: empty columns', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT_FROM_QUERY',
            table: 'audit',
            columns: [],
            query: buildSelect({ '@id': true }),
          }),
        TypeError,
        'non-empty array',
      );
    });

    it('invalid: columns with @ prefix', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT_FROM_QUERY',
            table: 'audit',
            columns: ['@id'],
            query: buildSelect({ '@id': true }),
          }),
        TypeError,
        "without '@' prefix",
      );
    });

    it('invalid: missing source query', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT_FROM_QUERY',
            table: 'audit',
            columns: ['id'],
          }),
        TypeError,
        "'query' (source SELECT) is required",
      );
    });

    it('invalid: source query is not a SELECT', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT_FROM_QUERY',
            table: 'audit',
            columns: ['id'],
            query: { type: 'INSERT', table: 'orders', columns: ['id'] },
          }),
        TypeError,
        'is not a valid SELECT',
      );
    });

    it('invalid: projection arity mismatches target columns', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT_FROM_QUERY',
            table: 'audit',
            columns: ['id', 'userId'], // 2 target cols
            query: buildSelect({
              '@id': true,
              '@userId': true,
              '@total': true, // 3 projection keys → mismatch
            }),
          }),
        TypeError,
        'they must match',
      );
    });

    it('invalid: schema is empty string', () => {
      asserts.assertThrows(
        () =>
          assertInsertFromQuery({
            type: 'INSERT_FROM_QUERY',
            table: 'audit',
            schema: '',
            columns: ['id'],
            query: buildSelect({ '@id': true }),
          }),
        TypeError,
        "'schema' must be a non-empty string",
      );
    });
  });

  describe('isInsertFromQuery type guard', () => {
    it('valid: matches assertion', () => {
      asserts.assertEquals(
        isInsertFromQuery({
          type: 'INSERT_FROM_QUERY',
          table: 'audit',
          columns: ['id'],
          query: buildSelect({ '@id': true }),
        }),
        true,
      );
    });

    it('invalid: returns false instead of throwing', () => {
      asserts.assertEquals(isInsertFromQuery('not-a-query'), false);
      asserts.assertEquals(isInsertFromQuery(null), false);
      asserts.assertEquals(
        isInsertFromQuery({ type: 'INSERT_FROM_QUERY' }),
        false,
      );
      asserts.assertEquals(
        isInsertFromQuery({
          type: 'INSERT_FROM_QUERY',
          table: 'audit',
          columns: ['id', 'name'],
          query: buildSelect({ '@id': true }), // arity mismatch
        }),
        false,
      );
    });

    it('type narrowing', () => {
      const value: unknown = {
        type: 'INSERT_FROM_QUERY',
        table: 'audit',
        columns: ['id'],
        query: buildSelect({ '@id': true }),
      };
      if (isInsertFromQuery(value)) {
        // Narrowed to Query<'INSERT_FROM_QUERY', ...>; access proves it.
        asserts.assertEquals(value.type, 'INSERT_FROM_QUERY');
        asserts.assertEquals(value.table, 'audit');
      }
    });
  });
});

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertAlterView,
  assertCreateView,
  assertDropView,
  assertRefreshMaterializedView,
  isAlterView,
  isCreateView,
  isDropView,
  isRefreshMaterializedView,
} from './view.ts';

const validSelect = {
  type: 'SELECT' as const,
  table: 'users',
  columns: ['id', 'name'],
  projection: { '@id': true, '@name': true },
};

describe('oql.asserts.Query.DDL.View', () => {
  describe('assertCreateView', () => {
    it('valid: minimal', () => {
      assertCreateView({
        type: 'CREATE_VIEW',
        view: 'active_users',
        query: validSelect,
      });
    });

    it('valid: materialized with schema', () => {
      assertCreateView({
        type: 'CREATE_VIEW',
        view: 'user_stats',
        schema: 'analytics',
        query: validSelect,
        materialized: true,
      });
    });

    it('valid: with ifNotExists', () => {
      assertCreateView({
        type: 'CREATE_VIEW',
        view: 'v',
        query: validSelect,
        ifNotExists: true,
      });
    });

    it('valid: with orReplace', () => {
      assertCreateView({
        type: 'CREATE_VIEW',
        view: 'v',
        query: validSelect,
        orReplace: true,
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertCreateView('foo'),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'DROP_VIEW',
            view: 'v',
            query: validSelect,
          }),
        TypeError,
        "type must be 'CREATE_VIEW'",
      );
    });

    it('invalid: missing view', () => {
      asserts.assertThrows(
        () => assertCreateView({ type: 'CREATE_VIEW', query: validSelect }),
        TypeError,
        'view name is required',
      );
    });

    it('invalid: view is not a string', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 123,
            query: validSelect,
          }),
        TypeError,
        'view must be a string, got number',
      );

      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: {},
            query: validSelect,
          }),
        TypeError,
        'view must be a string, got object',
      );
    });

    it('invalid: schema is not a string', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'myview',
            schema: 123,
            query: validSelect,
          }),
        TypeError,
        'schema must be a string, got number',
      );

      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'myview',
            schema: [],
            query: validSelect,
          }),
        TypeError,
        'schema must be a string, got object',
      );
    });

    it('invalid: bad view name', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'bad-name',
            query: validSelect,
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: schema with bad chars', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'v',
            schema: 'bad-schema',
            query: validSelect,
          }),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    it('invalid: missing query', () => {
      asserts.assertThrows(
        () => assertCreateView({ type: 'CREATE_VIEW', view: 'v' }),
        TypeError,
        'query is required',
      );
    });

    it('invalid: query is not a SELECT', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'v',
            query: { type: 'INSERT', table: 'x' },
          }),
        TypeError,
        'must be a valid SELECT query',
      );
    });

    it('invalid: non-boolean materialized', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'v',
            query: validSelect,
            materialized: 'yes',
          }),
        TypeError,
        'materialized must be a boolean',
      );
    });

    it('invalid: ifNotExists and orReplace together', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'v',
            query: validSelect,
            ifNotExists: true,
            orReplace: true,
          }),
        TypeError,
        'cannot both be true',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertCreateView({
            type: 'CREATE_VIEW',
            view: 'v',
            query: validSelect,
            bogus: 1,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isCreateView', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isCreateView({
          type: 'CREATE_VIEW',
          view: 'v',
          query: validSelect,
        }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isCreateView({ type: 'CREATE_VIEW' }), false);
      asserts.assertEquals(isCreateView(null), false);
    });
  });

  describe('assertDropView', () => {
    it('valid: minimal', () => {
      assertDropView({ type: 'DROP_VIEW', view: 'v' });
    });

    it('valid: with all options', () => {
      assertDropView({
        type: 'DROP_VIEW',
        view: 'v',
        schema: 'public',
        materialized: true,
        ifExists: true,
        cascade: true,
      });
    });

    it('invalid: non-boolean materialized', () => {
      asserts.assertThrows(
        () =>
          assertDropView({
            type: 'DROP_VIEW',
            view: 'v',
            materialized: 'yes',
          }),
        TypeError,
        'materialized',
      );
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertDropView(null),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertDropView('DROP_VIEW'),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertDropView({ type: 'CREATE_VIEW', view: 'v' }),
        TypeError,
        "type must be 'DROP_VIEW'",
      );
    });

    it('invalid: missing view', () => {
      asserts.assertThrows(
        () => assertDropView({ type: 'DROP_VIEW' }),
        TypeError,
        'view name is required',
      );
    });

    it('invalid: bad view name', () => {
      asserts.assertThrows(
        () => assertDropView({ type: 'DROP_VIEW', view: '1bad' }),
        TypeError,
        'must start with a letter',
      );
    });

    it('invalid: non-boolean ifExists', () => {
      asserts.assertThrows(
        () => assertDropView({ type: 'DROP_VIEW', view: 'v', ifExists: 'yes' }),
        TypeError,
        'ifExists must be a boolean',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () => assertDropView({ type: 'DROP_VIEW', view: 'v', bogus: true }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isDropView', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isDropView({ type: 'DROP_VIEW', view: 'v' }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(isDropView({ type: 'DROP_VIEW' }), false);
    });
  });

  describe('assertAlterView', () => {
    it('valid: rename only', () => {
      assertAlterView({
        type: 'ALTER_VIEW',
        view: 'old_name',
        renameTo: 'new_name',
      });
    });

    it('valid: redefine query only', () => {
      assertAlterView({
        type: 'ALTER_VIEW',
        view: 'v',
        query: validSelect,
      });
    });

    it('valid: rename and redefine', () => {
      assertAlterView({
        type: 'ALTER_VIEW',
        view: 'v',
        renameTo: 'v2',
        query: validSelect,
        schema: 'public',
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertAlterView(null),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertAlterView('ALTER_VIEW'),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertAlterView({ type: 'CREATE_VIEW', view: 'v' }),
        TypeError,
        "type must be 'ALTER_VIEW'",
      );
    });

    it('invalid: missing view', () => {
      asserts.assertThrows(
        () => assertAlterView({ type: 'ALTER_VIEW', renameTo: 'x' }),
        TypeError,
        'view name is required',
      );
    });

    it('invalid: bad renameTo', () => {
      asserts.assertThrows(
        () =>
          assertAlterView({
            type: 'ALTER_VIEW',
            view: 'v',
            renameTo: '1bad',
          }),
        TypeError,
        'must start with a letter',
      );
    });
    it('invalid: renameTo is not a string', () => {
      asserts.assertThrows(
        () =>
          assertAlterView({
            type: 'ALTER_VIEW',
            view: 'v',
            renameTo: 123,
          }),
        TypeError,
        'renameTo must be a string, got number',
      );

      asserts.assertThrows(
        () =>
          assertAlterView({
            type: 'ALTER_VIEW',
            view: 'v',
            renameTo: {},
          }),
        TypeError,
        'renameTo must be a string, got object',
      );
    });
    it('invalid: query is not a SELECT', () => {
      asserts.assertThrows(
        () =>
          assertAlterView({
            type: 'ALTER_VIEW',
            view: 'v',
            query: { type: 'INSERT', table: 'x' },
          }),
        TypeError,
        'must be a valid SELECT query',
      );
    });

    it('invalid: neither renameTo nor query', () => {
      asserts.assertThrows(
        () => assertAlterView({ type: 'ALTER_VIEW', view: 'v' }),
        TypeError,
        'at least one of renameTo or query',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertAlterView({
            type: 'ALTER_VIEW',
            view: 'v',
            renameTo: 'x',
            bogus: 1,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isAlterView', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isAlterView({ type: 'ALTER_VIEW', view: 'v', renameTo: 'x' }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(
        isAlterView({ type: 'ALTER_VIEW', view: 'v' }),
        false,
      );
    });
  });

  describe('assertRefreshMaterializedView', () => {
    it('valid: minimal', () => {
      assertRefreshMaterializedView({
        type: 'REFRESH_MATERIALIZED_VIEW',
        view: 'mv',
      });
    });

    it('valid: with schema and concurrently', () => {
      assertRefreshMaterializedView({
        type: 'REFRESH_MATERIALIZED_VIEW',
        view: 'mv',
        schema: 'analytics',
        concurrently: true,
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertRefreshMaterializedView(null),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertRefreshMaterializedView('REFRESH_MATERIALIZED_VIEW'),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertRefreshMaterializedView({ type: 'DROP_VIEW', view: 'mv' }),
        TypeError,
        "type must be 'REFRESH_MATERIALIZED_VIEW'",
      );
    });

    it('invalid: missing view', () => {
      asserts.assertThrows(
        () =>
          assertRefreshMaterializedView({ type: 'REFRESH_MATERIALIZED_VIEW' }),
        TypeError,
        'view name is required',
      );
    });

    it('invalid: non-boolean concurrently', () => {
      asserts.assertThrows(
        () =>
          assertRefreshMaterializedView({
            type: 'REFRESH_MATERIALIZED_VIEW',
            view: 'mv',
            concurrently: 'yes',
          }),
        TypeError,
        'concurrently must be a boolean',
      );
    });

    it('invalid: extra properties', () => {
      asserts.assertThrows(
        () =>
          assertRefreshMaterializedView({
            type: 'REFRESH_MATERIALIZED_VIEW',
            view: 'mv',
            bogus: 1,
          }),
        TypeError,
        'unexpected properties: bogus',
      );
    });
  });

  describe('isRefreshMaterializedView', () => {
    it('returns true for valid', () => {
      asserts.assertEquals(
        isRefreshMaterializedView({
          type: 'REFRESH_MATERIALIZED_VIEW',
          view: 'mv',
        }),
        true,
      );
    });

    it('returns false for invalid', () => {
      asserts.assertEquals(
        isRefreshMaterializedView({ type: 'REFRESH_MATERIALIZED_VIEW' }),
        false,
      );
    });
  });
});

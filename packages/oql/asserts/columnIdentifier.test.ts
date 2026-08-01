import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertColumnIdentifier,
  isColumnIdentifier,
} from './columnIdentifier.ts';

describe('oql.asserts.ColumnIdentifier', () => {
  describe('assertColumnIdentifier', () => {
    it('valid: simple column', () => {
      assertColumnIdentifier('@id');
      assertColumnIdentifier('@name');
      assertColumnIdentifier('@email');
      assertColumnIdentifier('@user_id');
      assertColumnIdentifier('@userId');
      assertColumnIdentifier('@_private');
      assertColumnIdentifier('@column123');
    });

    it('valid: nested column', () => {
      assertColumnIdentifier('@user.@id');
      assertColumnIdentifier('@user.@profile.@name');
      assertColumnIdentifier('@order.@item.@price');
      assertColumnIdentifier('@a.@b.@c.@d.@e');
    });

    it('valid: with column list', () => {
      assertColumnIdentifier('@id', ['id', 'name', 'email']);
      assertColumnIdentifier('@name', ['id', 'name', 'email']);
      assertColumnIdentifier('@user.@id', ['user.id', 'user.name']);
      assertColumnIdentifier('@user.@profile.@name', [
        'user.profile.name',
        'user.profile.email',
      ]);
    });

    it('invalid: not a string', () => {
      asserts.assertThrows(
        () => assertColumnIdentifier(123),
        TypeError,
        'Expected string',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier(null),
        TypeError,
        'Expected string',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier(undefined),
        TypeError,
        'Expected string',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier({ column: '@id' }),
        TypeError,
        'Expected string',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier(['@id']),
        TypeError,
        'Expected string',
      );
    });

    it('invalid: missing @ prefix', () => {
      asserts.assertThrows(
        () => assertColumnIdentifier('id'),
        TypeError,
        "must start with '@'",
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('user.id'),
        TypeError,
        "must start with '@'",
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user.id'),
        TypeError,
        "must start with '@'",
      );
    });

    it('invalid: empty identifier', () => {
      asserts.assertThrows(
        () => assertColumnIdentifier('@'),
        TypeError,
        'empty identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@.@id'),
        TypeError,
        'empty identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user.@'),
        TypeError,
        'empty identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@ '),
        TypeError,
        'empty identifier',
      );
    });

    it('invalid: invalid identifier pattern', () => {
      asserts.assertThrows(
        () => assertColumnIdentifier('@123abc'),
        TypeError,
        'invalid identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user-id'),
        TypeError,
        'invalid identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user$id'),
        TypeError,
        'invalid identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user id'),
        TypeError,
        'invalid identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user@id'),
        TypeError,
        'invalid identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user.@id-test'),
        TypeError,
        'invalid identifier',
      );
    });

    it('invalid: not in column list', () => {
      const columnList = ['id', 'name', 'email'];

      asserts.assertThrows(
        () => assertColumnIdentifier('@age', columnList),
        TypeError,
        'not in the provided column list',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user', columnList),
        TypeError,
        'not in the provided column list',
      );

      const nestedColumnList = ['user.id', 'user.name', 'order.total'];

      asserts.assertThrows(
        () => assertColumnIdentifier('@user.@email', nestedColumnList),
        TypeError,
        'not in the provided column list',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@order.@id', nestedColumnList),
        TypeError,
        'not in the provided column list',
      );
    });

    it('invalid: empty column list rejects all refs', () => {
      // [] means "no columns are valid in this context" (e.g. INSERT
      // VALUES, where there's no source row to reference). Distinct
      // from `undefined`, which means "no constraint".
      asserts.assertThrows(
        () => assertColumnIdentifier('@id', []),
        TypeError,
        'not in the provided column list',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@name', []),
        TypeError,
        'not in the provided column list',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@user.@profile', []),
        TypeError,
        'not in the provided column list',
      );
    });
  });

  describe('isColumnIdentifier type guard', () => {
    it('valid: simple columns', () => {
      asserts.assertEquals(isColumnIdentifier('@id'), true);
      asserts.assertEquals(isColumnIdentifier('@name'), true);
      asserts.assertEquals(isColumnIdentifier('@_private'), true);
      asserts.assertEquals(isColumnIdentifier('@userId123'), true);
    });

    it('valid: nested columns', () => {
      asserts.assertEquals(isColumnIdentifier('@user.@id'), true);
      asserts.assertEquals(isColumnIdentifier('@user.@profile.@name'), true);
      asserts.assertEquals(isColumnIdentifier('@a.@b.@c'), true);
    });

    it('valid: with column list', () => {
      const columnList = ['id', 'name', 'email'];
      asserts.assertEquals(isColumnIdentifier('@id', columnList), true);
      asserts.assertEquals(isColumnIdentifier('@name', columnList), true);
      asserts.assertEquals(isColumnIdentifier('@age', columnList), false);
    });

    it('invalid: not a string', () => {
      asserts.assertEquals(isColumnIdentifier(123), false);
      asserts.assertEquals(isColumnIdentifier(null), false);
      asserts.assertEquals(isColumnIdentifier(undefined), false);
      asserts.assertEquals(isColumnIdentifier({ column: '@id' }), false);
      asserts.assertEquals(isColumnIdentifier(['@id']), false);
    });

    it('invalid: missing @ prefix', () => {
      asserts.assertEquals(isColumnIdentifier('id'), false);
      asserts.assertEquals(isColumnIdentifier('user.id'), false);
      asserts.assertEquals(isColumnIdentifier('name'), false);
    });

    it('invalid: empty identifier', () => {
      asserts.assertEquals(isColumnIdentifier('@'), false);
      asserts.assertEquals(isColumnIdentifier('@.id'), false);
      asserts.assertEquals(isColumnIdentifier('@user.'), false);
      asserts.assertEquals(isColumnIdentifier('@ '), false);
    });

    it('invalid: invalid pattern', () => {
      asserts.assertEquals(isColumnIdentifier('@123abc'), false);
      asserts.assertEquals(isColumnIdentifier('@user-id'), false);
      asserts.assertEquals(isColumnIdentifier('@user$id'), false);
      asserts.assertEquals(isColumnIdentifier('@user id'), false);
      asserts.assertEquals(isColumnIdentifier('@user@id'), false);
    });

    it('invalid: not in column list', () => {
      const columnList = ['id', 'name', 'email'];
      asserts.assertEquals(isColumnIdentifier('@age', columnList), false);
      asserts.assertEquals(isColumnIdentifier('@user', columnList), false);

      const nestedColumnList = ['user.id', 'user.name'];
      asserts.assertEquals(
        isColumnIdentifier('@user.@email', nestedColumnList),
        false,
      );
    });

    it('type narrowing', () => {
      const value: unknown = '@userId';
      if (isColumnIdentifier(value)) {
        asserts.assertEquals(typeof value, 'string');
        asserts.assertEquals(value.startsWith('@'), true);
      }
    });
  });

  describe('edge cases', () => {
    it('multiple underscores', () => {
      assertColumnIdentifier('@__private__');
      assertColumnIdentifier('@user___id');
      asserts.assertEquals(isColumnIdentifier('@__test__'), true);
    });

    it('mixed case identifiers', () => {
      assertColumnIdentifier('@userId');
      assertColumnIdentifier('@UserID');
      assertColumnIdentifier('@CONSTANT_VALUE');
      assertColumnIdentifier('@camelCaseColumn');
      assertColumnIdentifier('@PascalCaseColumn');
      asserts.assertEquals(isColumnIdentifier('@mixedCASE123'), true);
    });

    it('alphanumeric combinations', () => {
      assertColumnIdentifier('@col1');
      assertColumnIdentifier('@user2024');
      assertColumnIdentifier('@temp_var_123');
      assertColumnIdentifier('@_123_test');
      asserts.assertEquals(isColumnIdentifier('@abc123xyz'), true);
    });

    it('deeply nested columns', () => {
      assertColumnIdentifier('@a.@b.@c.@d.@e.@f.@g.@h.@i.@j');
      const deepColumn = '@level1.@level2.@level3.@level4.@level5';
      asserts.assertEquals(isColumnIdentifier(deepColumn), true);
    });

    it('column list with exact match', () => {
      const columnList = ['id', 'user.id', 'user.profile.name'];

      assertColumnIdentifier('@id', columnList);
      assertColumnIdentifier('@user.@id', columnList);
      assertColumnIdentifier('@user.@profile.@name', columnList);

      asserts.assertThrows(
        () => assertColumnIdentifier('@user', columnList),
        TypeError,
        'not in the provided column list',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@user.@profile', columnList),
        TypeError,
        'not in the provided column list',
      );
    });

    it('column list validation is case-sensitive', () => {
      const columnList = ['userId', 'userName'];

      assertColumnIdentifier('@userId', columnList);
      assertColumnIdentifier('@userName', columnList);

      asserts.assertThrows(
        () => assertColumnIdentifier('@userid', columnList),
        TypeError,
        'not in the provided column list',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@UserName', columnList),
        TypeError,
        'not in the provided column list',
      );
    });

    it('whitespace handling', () => {
      asserts.assertThrows(
        () => assertColumnIdentifier('@ id'),
        TypeError,
        'invalid identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@id '),
        TypeError,
        'invalid identifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@ '),
        TypeError,
        'empty identifier',
      );
    });

    it('rejects unicode column names', () => {
      // Identifier regex is ASCII-only by design: /^[a-zA-Z_]\w*$/.
      // Database identifier rules vary by dialect (Postgres allows
      // arbitrary Unicode if quoted; SQLite is more permissive than
      // Postgres unquoted; MariaDB requires backticks for non-ASCII).
      // OQL takes the strictest stance — ASCII only — so a query is
      // portable across every dialect we target.
      asserts.assertThrows(
        () => assertColumnIdentifier('@ñame'),
        TypeError,
        'invalid identifier',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@用户'),
        TypeError,
        'invalid identifier',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@user.@日本'),
        TypeError,
        'invalid identifier',
      );
      asserts.assertEquals(isColumnIdentifier('@café'), false);
    });

    it('rejects control characters and punctuation', () => {
      // Most of these would be SQL-injection vectors if accepted; we
      // reject them with the same "invalid identifier" message.
      asserts.assertThrows(
        () => assertColumnIdentifier('@id;DROP'),
        TypeError,
        'invalid identifier',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@id,name'),
        TypeError,
        'invalid identifier',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@id\t'),
        TypeError,
        'invalid identifier',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@id\nname'),
        TypeError,
        'invalid identifier',
      );
      asserts.assertThrows(
        () => assertColumnIdentifier('@id\0'),
        TypeError,
        'invalid identifier',
      );
    });

    it('handles very long identifiers (>255 chars)', () => {
      // Most engines cap identifiers at 63 (Postgres) / 64 (MariaDB) /
      // unlimited (SQLite) / unlimited (Mongo). OQL doesn't enforce a
      // length cap itself — the database rejects the actual statement.
      // We just check the regex doesn't choke on long input.
      const longValid = '@' + 'a'.repeat(500);
      assertColumnIdentifier(longValid);
      asserts.assertEquals(isColumnIdentifier(longValid), true);

      // Equivalent length with a bad char still rejects fast.
      const longInvalid = '@' + 'a'.repeat(500) + '-bad';
      asserts.assertThrows(
        () => assertColumnIdentifier(longInvalid),
        TypeError,
        'invalid identifier',
      );

      // Deeply nested very long identifier.
      const deepLong = Array.from(
        { length: 10 },
        (_, i) => `@col${'_'.repeat(50)}${i}`,
      ).join('.');
      assertColumnIdentifier(deepLong);
    });
  });

  describe('__base__ prefix handling', () => {
    it('simple column matches __base__ qualified in list', () => {
      // When columnList has __base__.id, @id should match
      const columnList = ['__base__.id', '__base__.name', '__base__.email'];

      assertColumnIdentifier('@id', columnList);
      assertColumnIdentifier('@name', columnList);
      assertColumnIdentifier('@email', columnList);

      // Still respects exact match if it exists
      const mixedList = ['id', '__base__.name'];
      assertColumnIdentifier('@id', mixedList); // exact match
      assertColumnIdentifier('@name', mixedList); // __base__ match
    });

    it('__base__ qualified column matches simple in list', () => {
      // When columnList has just id, @__base__.@id should match
      const columnList = ['id', 'name', 'email'];

      assertColumnIdentifier('@__base__.@id', columnList);
      assertColumnIdentifier('@__base__.@name', columnList);
      assertColumnIdentifier('@__base__.@email', columnList);

      // Still respects exact match if it exists
      const mixedList = ['__base__.id', 'name'];
      assertColumnIdentifier('@__base__.@id', mixedList); // exact match
      assertColumnIdentifier('@__base__.@name', mixedList); // simple match
    });

    it('__base__ matching does not apply to deeply nested columns', () => {
      const columnList = ['__base__.id', 'name'];

      // Only works for simple (1 part) or 2-part with __base__ prefix
      asserts.assertThrows(
        () => assertColumnIdentifier('@user.@id', columnList),
        TypeError,
        'not in the provided column list',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@__base__.@user.@id', columnList),
        TypeError,
        'not in the provided column list',
      );
    });

    it('isColumnIdentifier with __base__ prefix', () => {
      const columnList = ['__base__.id', '__base__.name'];

      asserts.assertEquals(isColumnIdentifier('@id', columnList), true);
      asserts.assertEquals(isColumnIdentifier('@name', columnList), true);
      asserts.assertEquals(isColumnIdentifier('@email', columnList), false);

      const simpleList = ['id', 'name'];
      asserts.assertEquals(
        isColumnIdentifier('@__base__.@id', simpleList),
        true,
      );
      asserts.assertEquals(
        isColumnIdentifier('@__base__.@name', simpleList),
        true,
      );
      asserts.assertEquals(
        isColumnIdentifier('@__base__.@email', simpleList),
        false,
      );
    });
  });

  describe('integration tests', () => {
    it('use with actual column list', () => {
      const userTableColumns = [
        'id',
        'username',
        'email',
        'firstName',
        'lastName',
        'createdAt',
        'updatedAt',
      ];

      assertColumnIdentifier('@id', userTableColumns);
      assertColumnIdentifier('@username', userTableColumns);
      assertColumnIdentifier('@email', userTableColumns);
      assertColumnIdentifier('@createdAt', userTableColumns);

      asserts.assertThrows(
        () => assertColumnIdentifier('@password', userTableColumns),
        TypeError,
        'not in the provided column list',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@age', userTableColumns),
        TypeError,
        'not in the provided column list',
      );
    });

    it('nested table structure', () => {
      const joinedColumns = [
        'users.id',
        'users.name',
        'users.email',
        'orders.id',
        'orders.userId',
        'orders.total',
        'orders.createdAt',
      ];

      assertColumnIdentifier('@users.@id', joinedColumns);
      assertColumnIdentifier('@users.@name', joinedColumns);
      assertColumnIdentifier('@orders.@total', joinedColumns);

      asserts.assertThrows(
        () => assertColumnIdentifier('@users.@age', joinedColumns),
        TypeError,
        'not in the provided column list',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('@orders.@status', joinedColumns),
        TypeError,
        'not in the provided column list',
      );
    });

    it('filter array with isColumnIdentifier', () => {
      const mixedArray: unknown[] = [
        '@id',
        '@name',
        'invalid',
        123,
        '@user.@id',
        null,
        '@email',
        '@123invalid',
        '@valid_column',
        '@user-invalid',
      ];

      const validColumns = mixedArray.filter((x) => isColumnIdentifier(x));

      asserts.assertEquals(validColumns.length, 5);
      asserts.assertEquals(validColumns, [
        '@id',
        '@name',
        '@user.@id',
        '@email',
        '@valid_column',
      ]);
    });

    it('validate query column references', () => {
      const availableColumns = ['id', 'name', 'email', 'age', 'city'];
      const queryColumns = ['@id', '@name', '@email'];

      for (const col of queryColumns) {
        asserts.assertEquals(
          isColumnIdentifier(col, availableColumns),
          true,
        );
      }

      const invalidQueryColumn = '@invalidColumn';
      asserts.assertEquals(
        isColumnIdentifier(invalidQueryColumn, availableColumns),
        false,
      );
    });
  });
});

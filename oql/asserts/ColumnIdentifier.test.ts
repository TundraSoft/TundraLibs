import * as asserts from '$asserts';
import {
  assertColumnIdentifier,
  isColumnIdentifier,
} from './ColumnIdentifier.ts';

Deno.test('oql.asserts.ColumnIdentifier', async (t) => {
  await t.step('assertColumnIdentifier', async (u) => {
    await u.step('valid: simple column', () => {
      assertColumnIdentifier('@id');
      assertColumnIdentifier('@name');
      assertColumnIdentifier('@email');
      assertColumnIdentifier('@user_id');
      assertColumnIdentifier('@userId');
      assertColumnIdentifier('@_private');
      assertColumnIdentifier('@column123');
    });

    await u.step('valid: nested column', () => {
      assertColumnIdentifier('@user.@id');
      assertColumnIdentifier('@user.@profile.@name');
      assertColumnIdentifier('@order.@item.@price');
      assertColumnIdentifier('@a.@b.@c.@d.@e');
    });

    await u.step('valid: with column list', () => {
      assertColumnIdentifier('@id', ['id', 'name', 'email']);
      assertColumnIdentifier('@name', ['id', 'name', 'email']);
      assertColumnIdentifier('@user.@id', ['user.id', 'user.name']);
      assertColumnIdentifier('@user.@profile.@name', [
        'user.profile.name',
        'user.profile.email',
      ]);
    });

    await u.step('invalid: not a string', () => {
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

    await u.step('invalid: missing @ prefix', () => {
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

    await u.step('invalid: empty identifier', () => {
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

    await u.step('invalid: invalid identifier pattern', () => {
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

    await u.step('invalid: not in column list', () => {
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

    await u.step('valid: empty column list allows all', () => {
      assertColumnIdentifier('@id', []);
      assertColumnIdentifier('@name', []);
      assertColumnIdentifier('@user.@profile', []);
    });
  });

  await t.step('isColumnIdentifier type guard', async (u) => {
    await u.step('valid: simple columns', () => {
      asserts.assertEquals(isColumnIdentifier('@id'), true);
      asserts.assertEquals(isColumnIdentifier('@name'), true);
      asserts.assertEquals(isColumnIdentifier('@_private'), true);
      asserts.assertEquals(isColumnIdentifier('@userId123'), true);
    });

    await u.step('valid: nested columns', () => {
      asserts.assertEquals(isColumnIdentifier('@user.@id'), true);
      asserts.assertEquals(isColumnIdentifier('@user.@profile.@name'), true);
      asserts.assertEquals(isColumnIdentifier('@a.@b.@c'), true);
    });

    await u.step('valid: with column list', () => {
      const columnList = ['id', 'name', 'email'];
      asserts.assertEquals(isColumnIdentifier('@id', columnList), true);
      asserts.assertEquals(isColumnIdentifier('@name', columnList), true);
      asserts.assertEquals(isColumnIdentifier('@age', columnList), false);
    });

    await u.step('invalid: not a string', () => {
      asserts.assertEquals(isColumnIdentifier(123), false);
      asserts.assertEquals(isColumnIdentifier(null), false);
      asserts.assertEquals(isColumnIdentifier(undefined), false);
      asserts.assertEquals(isColumnIdentifier({ column: '@id' }), false);
      asserts.assertEquals(isColumnIdentifier(['@id']), false);
    });

    await u.step('invalid: missing @ prefix', () => {
      asserts.assertEquals(isColumnIdentifier('id'), false);
      asserts.assertEquals(isColumnIdentifier('user.id'), false);
      asserts.assertEquals(isColumnIdentifier('name'), false);
    });

    await u.step('invalid: empty identifier', () => {
      asserts.assertEquals(isColumnIdentifier('@'), false);
      asserts.assertEquals(isColumnIdentifier('@.id'), false);
      asserts.assertEquals(isColumnIdentifier('@user.'), false);
      asserts.assertEquals(isColumnIdentifier('@ '), false);
    });

    await u.step('invalid: invalid pattern', () => {
      asserts.assertEquals(isColumnIdentifier('@123abc'), false);
      asserts.assertEquals(isColumnIdentifier('@user-id'), false);
      asserts.assertEquals(isColumnIdentifier('@user$id'), false);
      asserts.assertEquals(isColumnIdentifier('@user id'), false);
      asserts.assertEquals(isColumnIdentifier('@user@id'), false);
    });

    await u.step('invalid: not in column list', () => {
      const columnList = ['id', 'name', 'email'];
      asserts.assertEquals(isColumnIdentifier('@age', columnList), false);
      asserts.assertEquals(isColumnIdentifier('@user', columnList), false);

      const nestedColumnList = ['user.id', 'user.name'];
      asserts.assertEquals(
        isColumnIdentifier('@user.@email', nestedColumnList),
        false,
      );
    });

    await u.step('type narrowing', () => {
      const value: unknown = '@userId';
      if (isColumnIdentifier(value)) {
        asserts.assertEquals(typeof value, 'string');
        asserts.assertEquals(value.startsWith('@'), true);
      }
    });
  });

  await t.step('edge cases', async (u) => {
    await u.step('multiple underscores', () => {
      assertColumnIdentifier('@__private__');
      assertColumnIdentifier('@user___id');
      asserts.assertEquals(isColumnIdentifier('@__test__'), true);
    });

    await u.step('mixed case identifiers', () => {
      assertColumnIdentifier('@userId');
      assertColumnIdentifier('@UserID');
      assertColumnIdentifier('@CONSTANT_VALUE');
      assertColumnIdentifier('@camelCaseColumn');
      assertColumnIdentifier('@PascalCaseColumn');
      asserts.assertEquals(isColumnIdentifier('@mixedCASE123'), true);
    });

    await u.step('alphanumeric combinations', () => {
      assertColumnIdentifier('@col1');
      assertColumnIdentifier('@user2024');
      assertColumnIdentifier('@temp_var_123');
      assertColumnIdentifier('@_123_test');
      asserts.assertEquals(isColumnIdentifier('@abc123xyz'), true);
    });

    await u.step('deeply nested columns', () => {
      assertColumnIdentifier('@a.@b.@c.@d.@e.@f.@g.@h.@i.@j');
      const deepColumn = '@level1.@level2.@level3.@level4.@level5';
      asserts.assertEquals(isColumnIdentifier(deepColumn), true);
    });

    await u.step('column list with exact match', () => {
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

    await u.step('column list validation is case-sensitive', () => {
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

    await u.step('whitespace handling', () => {
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
  });

  await t.step('integration tests', async (u) => {
    await u.step('use with actual column list', () => {
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

    await u.step('nested table structure', () => {
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

    await u.step('filter array with isColumnIdentifier', () => {
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

    await u.step('validate query column references', () => {
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

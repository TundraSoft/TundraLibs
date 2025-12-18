import * as asserts from '$asserts';
import {
  assertColumnIdentifier,
  isColumnIdentifier,
} from './ColumnIdentifier.ts';

Deno.test('oql.asserts.ColumnIdentifier', async (t) => {
  //#region assertColumnIdentifier Tests

  await t.step('assertColumnIdentifier - valid simple column', () => {
    assertColumnIdentifier('@id');
    assertColumnIdentifier('@name');
    assertColumnIdentifier('@email');
    assertColumnIdentifier('@user_id');
    assertColumnIdentifier('@userId');
    assertColumnIdentifier('@_private');
    assertColumnIdentifier('@column123');
  });

  await t.step('assertColumnIdentifier - valid nested column', () => {
    assertColumnIdentifier('@user.@id');
    assertColumnIdentifier('@user.@profile.@name');
    assertColumnIdentifier('@order.@item.@price');
    assertColumnIdentifier('@a.@b.@c.@d.@e');
  });

  await t.step('assertColumnIdentifier - valid with column list', () => {
    assertColumnIdentifier('@id', ['id', 'name', 'email']);
    assertColumnIdentifier('@name', ['id', 'name', 'email']);
    assertColumnIdentifier('@user.@id', ['user.id', 'user.name']);
    assertColumnIdentifier('@user.@profile.@name', [
      'user.profile.name',
      'user.profile.email',
    ]);
  });

  await t.step('assertColumnIdentifier - invalid: not a string', () => {
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

  await t.step('assertColumnIdentifier - invalid: missing @ prefix', () => {
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

  await t.step('assertColumnIdentifier - invalid: empty identifier', () => {
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

  await t.step(
    'assertColumnIdentifier - invalid: invalid identifier pattern',
    () => {
      // Starting with number
      asserts.assertThrows(
        () => assertColumnIdentifier('@123abc'),
        TypeError,
        'invalid identifier',
      );

      // Special characters (other than underscore)
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
    },
  );

  await t.step(
    'assertColumnIdentifier - invalid: not in column list',
    () => {
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

      // Nested columns
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
    },
  );

  await t.step('assertColumnIdentifier - empty column list allows all', () => {
    // Empty column list should not validate
    assertColumnIdentifier('@id', []);
    assertColumnIdentifier('@name', []);
    assertColumnIdentifier('@user.@profile', []);
  });

  //#endregion assertColumnIdentifier Tests

  //#region isColumnIdentifier Tests

  await t.step('isColumnIdentifier - valid simple columns', () => {
    asserts.assertEquals(isColumnIdentifier('@id'), true);
    asserts.assertEquals(isColumnIdentifier('@name'), true);
    asserts.assertEquals(isColumnIdentifier('@_private'), true);
    asserts.assertEquals(isColumnIdentifier('@userId123'), true);
  });

  await t.step('isColumnIdentifier - valid nested columns', () => {
    asserts.assertEquals(isColumnIdentifier('@user.@id'), true);
    asserts.assertEquals(isColumnIdentifier('@user.@profile.@name'), true);
    asserts.assertEquals(isColumnIdentifier('@a.@b.@c'), true);
  });

  await t.step('isColumnIdentifier - valid with column list', () => {
    const columnList = ['id', 'name', 'email'];
    asserts.assertEquals(isColumnIdentifier('@id', columnList), true);
    asserts.assertEquals(isColumnIdentifier('@name', columnList), true);
    asserts.assertEquals(isColumnIdentifier('@age', columnList), false);
  });

  await t.step('isColumnIdentifier - invalid: not a string', () => {
    asserts.assertEquals(isColumnIdentifier(123), false);
    asserts.assertEquals(isColumnIdentifier(null), false);
    asserts.assertEquals(isColumnIdentifier(undefined), false);
    asserts.assertEquals(isColumnIdentifier({ column: '@id' }), false);
    asserts.assertEquals(isColumnIdentifier(['@id']), false);
  });

  await t.step('isColumnIdentifier - invalid: missing @ prefix', () => {
    asserts.assertEquals(isColumnIdentifier('id'), false);
    asserts.assertEquals(isColumnIdentifier('user.id'), false);
    asserts.assertEquals(isColumnIdentifier('name'), false);
  });

  await t.step('isColumnIdentifier - invalid: empty identifier', () => {
    asserts.assertEquals(isColumnIdentifier('@'), false);
    asserts.assertEquals(isColumnIdentifier('@.id'), false);
    asserts.assertEquals(isColumnIdentifier('@user.'), false);
    asserts.assertEquals(isColumnIdentifier('@ '), false);
  });

  await t.step('isColumnIdentifier - invalid: invalid pattern', () => {
    asserts.assertEquals(isColumnIdentifier('@123abc'), false);
    asserts.assertEquals(isColumnIdentifier('@user-id'), false);
    asserts.assertEquals(isColumnIdentifier('@user$id'), false);
    asserts.assertEquals(isColumnIdentifier('@user id'), false);
    asserts.assertEquals(isColumnIdentifier('@user@id'), false);
  });

  await t.step('isColumnIdentifier - invalid: not in column list', () => {
    const columnList = ['id', 'name', 'email'];
    asserts.assertEquals(isColumnIdentifier('@age', columnList), false);
    asserts.assertEquals(isColumnIdentifier('@user', columnList), false);

    const nestedColumnList = ['user.id', 'user.name'];
    asserts.assertEquals(
      isColumnIdentifier('@user.@email', nestedColumnList),
      false,
    );
  });

  await t.step('Type guard narrowing with isColumnIdentifier', () => {
    const value: unknown = '@userId';
    if (isColumnIdentifier(value)) {
      // TypeScript should narrow to ColumnIdentifier (string) type
      asserts.assertEquals(typeof value, 'string');
      asserts.assertEquals(value.startsWith('@'), true);
    }
  });

  //#endregion isColumnIdentifier Tests

  //#region Edge Cases

  await t.step('Edge case: multiple underscores', () => {
    assertColumnIdentifier('@__private__');
    assertColumnIdentifier('@user___id');
    asserts.assertEquals(isColumnIdentifier('@__test__'), true);
  });

  await t.step('Edge case: mixed case identifiers', () => {
    assertColumnIdentifier('@userId');
    assertColumnIdentifier('@UserID');
    assertColumnIdentifier('@CONSTANT_VALUE');
    assertColumnIdentifier('@camelCaseColumn');
    assertColumnIdentifier('@PascalCaseColumn');
    asserts.assertEquals(isColumnIdentifier('@mixedCASE123'), true);
  });

  await t.step('Edge case: alphanumeric combinations', () => {
    assertColumnIdentifier('@col1');
    assertColumnIdentifier('@user2024');
    assertColumnIdentifier('@temp_var_123');
    assertColumnIdentifier('@_123_test');
    asserts.assertEquals(isColumnIdentifier('@abc123xyz'), true);
  });

  await t.step('Edge case: deeply nested columns', () => {
    assertColumnIdentifier('@a.@b.@c.@d.@e.@f.@g.@h.@i.@j');
    const deepColumn = '@level1.@level2.@level3.@level4.@level5';
    asserts.assertEquals(isColumnIdentifier(deepColumn), true);
  });

  await t.step('Edge case: column list with exact match', () => {
    const columnList = ['id', 'user.id', 'user.profile.name'];

    // Exact matches should pass
    assertColumnIdentifier('@id', columnList);
    assertColumnIdentifier('@user.@id', columnList);
    assertColumnIdentifier('@user.@profile.@name', columnList);

    // Partial matches should fail
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

  await t.step('Edge case: column list validation is case-sensitive', () => {
    const columnList = ['userId', 'userName'];

    assertColumnIdentifier('@userId', columnList);
    assertColumnIdentifier('@userName', columnList);

    // Different case should fail
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

  await t.step('Edge case: whitespace handling', () => {
    // Leading/trailing spaces in identifier (after @) should fail
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

  //#endregion Edge Cases

  //#region Integration Tests

  await t.step('Integration: use with actual column list', () => {
    // Simulating a real table schema
    const userTableColumns = [
      'id',
      'username',
      'email',
      'firstName',
      'lastName',
      'createdAt',
      'updatedAt',
    ];

    // Valid columns
    assertColumnIdentifier('@id', userTableColumns);
    assertColumnIdentifier('@username', userTableColumns);
    assertColumnIdentifier('@email', userTableColumns);
    assertColumnIdentifier('@createdAt', userTableColumns);

    // Invalid columns
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

  await t.step('Integration: nested table structure', () => {
    // Simulating a nested/joined table structure
    const joinedColumns = [
      'users.id',
      'users.name',
      'users.email',
      'orders.id',
      'orders.userId',
      'orders.total',
      'orders.createdAt',
    ];

    // Valid nested columns
    assertColumnIdentifier('@users.@id', joinedColumns);
    assertColumnIdentifier('@users.@name', joinedColumns);
    assertColumnIdentifier('@orders.@total', joinedColumns);

    // Invalid nested columns
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

  await t.step('Integration: filter array with isColumnIdentifier', () => {
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

  await t.step(
    'Integration: validate query column references',
    () => {
      // Simulating query validation
      const availableColumns = ['id', 'name', 'email', 'age', 'city'];

      const queryColumns = ['@id', '@name', '@email'];

      // All query columns should be valid
      for (const col of queryColumns) {
        asserts.assertEquals(
          isColumnIdentifier(col, availableColumns),
          true,
        );
      }

      // Invalid query column should fail
      const invalidQueryColumn = '@invalidColumn';
      asserts.assertEquals(
        isColumnIdentifier(invalidQueryColumn, availableColumns),
        false,
      );
    },
  );

  //#endregion Integration Tests
});

import * as asserts from '$asserts';
import {
  assertConcatExpression,
  assertDecryptExpression,
  assertEncryptExpression,
  assertHashExpression,
  assertLowerExpression,
  assertLPadExpression,
  assertLTrimExpression,
  assertReplaceExpression,
  assertRPadExpression,
  assertRTrimExpression,
  assertStringExpression,
  assertSubstrExpression,
  assertTrimExpression,
  assertUpperExpression,
  assertUUIDExpression,
  isConcatExpression,
  isDecryptExpression,
  isEncryptExpression,
  isHashExpression,
  isLowerExpression,
  isLPadExpression,
  isLTrimExpression,
  isReplaceExpression,
  isRPadExpression,
  isRTrimExpression,
  isStringExpression,
  isSubstrExpression,
  isTrimExpression,
  isUpperExpression,
  isUUIDExpression,
} from './String.ts';

Deno.test('oql.asserts.Expressions.String', async (t) => {
  //#region UUID Expression Tests

  await t.step('assertUUIDExpression - valid UUID expression', () => {
    assertUUIDExpression({ type: 'UUID' });
  });

  await t.step('assertUUIDExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertUUIDExpression({ type: 'CONCAT' } as any),
      TypeError,
      "Expected 'UUID'",
    );
  });

  await t.step('isUUIDExpression - valid and invalid', () => {
    asserts.assertEquals(isUUIDExpression({ type: 'UUID' }), true);
    asserts.assertEquals(isUUIDExpression({ type: 'CONCAT' }), false);
  });

  //#endregion UUID Expression Tests

  //#region CONCAT Expression Tests

  await t.step('assertConcatExpression - valid with literal strings', () => {
    assertConcatExpression({ type: 'CONCAT', args: ['Hello', ' ', 'World'] });
  });

  await t.step('assertConcatExpression - valid with single string', () => {
    assertConcatExpression({ type: 'CONCAT', args: ['Hello'] });
  });

  await t.step('assertConcatExpression - valid with column references', () => {
    assertConcatExpression(
      { type: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
      ['first_name', 'last_name'],
    );
  });

  await t.step('assertConcatExpression - valid with mixed types', () => {
    assertConcatExpression(
      { type: 'CONCAT', args: ['User: ', '@username', ' (', '@email', ')'] },
      ['username', 'email'],
    );
  });

  await t.step('assertConcatExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertConcatExpression({ type: 'LOWER' } as any),
      TypeError,
      "Expected 'CONCAT'",
    );
  });

  await t.step('assertConcatExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertConcatExpression({ type: 'CONCAT' } as any),
      TypeError,
      "'args' must be a non-empty array for CONCAT",
    );
  });

  await t.step('assertConcatExpression - invalid: empty args array', () => {
    asserts.assertThrows(
      () => assertConcatExpression({ type: 'CONCAT', args: [] } as any),
      TypeError,
      "'args' must be a non-empty array for CONCAT",
    );
  });

  await t.step('assertConcatExpression - invalid: non-string arg', () => {
    asserts.assertThrows(
      () => assertConcatExpression({ type: 'CONCAT', args: [123] } as any),
      TypeError,
      'Invalid argument',
    );
  });

  await t.step('assertConcatExpression - invalid: invalid column', () => {
    asserts.assertThrows(
      () =>
        assertConcatExpression(
          { type: 'CONCAT', args: ['@invalid'] },
          ['first_name', 'last_name'],
        ),
      TypeError,
      'Invalid column identifier',
    );
  });

  await t.step(
    'assertConcatExpression - invalid: number with column list',
    () => {
      asserts.assertThrows(
        () =>
          assertConcatExpression(
            { type: 'CONCAT', args: ['@col', 123] },
            ['col'],
          ),
        TypeError,
        'Invalid argument 123 in CONCAT expression',
      );
    },
  );

  await t.step('isConcatExpression - valid and invalid', () => {
    asserts.assertEquals(
      isConcatExpression({ type: 'CONCAT', args: ['a', 'b'] }),
      true,
    );
    asserts.assertEquals(
      isConcatExpression({ type: 'CONCAT', args: [] }),
      false,
    );
  });

  //#endregion CONCAT Expression Tests

  //#region LOWER Expression Tests

  await t.step('assertLowerExpression - valid with literal string', () => {
    assertLowerExpression({ type: 'LOWER', args: 'HELLO' });
  });

  await t.step('assertLowerExpression - valid with column reference', () => {
    assertLowerExpression({ type: 'LOWER', args: '@email' }, ['email']);
  });

  await t.step('assertLowerExpression - valid with empty string', () => {
    assertLowerExpression({ type: 'LOWER', args: '' });
  });

  await t.step('assertLowerExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertLowerExpression({ type: 'UPPER' } as any),
      TypeError,
      "Expected 'LOWER'",
    );
  });

  await t.step('assertLowerExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertLowerExpression({ type: 'LOWER' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertLowerExpression - invalid: numeric arg', () => {
    asserts.assertThrows(
      () => assertLowerExpression({ type: 'LOWER', args: 123 } as any),
      TypeError,
      'Invalid',
    );
  });

  await t.step('isLowerExpression - valid and invalid', () => {
    asserts.assertEquals(
      isLowerExpression({ type: 'LOWER', args: 'test' }),
      true,
    );
    asserts.assertEquals(
      isLowerExpression({ type: 'LOWER', args: 123 }),
      false,
    );
  });

  //#endregion LOWER Expression Tests

  //#region UPPER Expression Tests

  await t.step('assertUpperExpression - valid with literal string', () => {
    assertUpperExpression({ type: 'UPPER', args: 'hello' });
  });

  await t.step('assertUpperExpression - valid with column reference', () => {
    assertUpperExpression(
      { type: 'UPPER', args: '@country_code' },
      ['country_code'],
    );
  });

  await t.step('assertUpperExpression - valid with empty string', () => {
    assertUpperExpression({ type: 'UPPER', args: '' });
  });

  await t.step('assertUpperExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertUpperExpression({ type: 'LOWER' } as any),
      TypeError,
      "Expected 'UPPER'",
    );
  });

  await t.step('assertUpperExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertUpperExpression({ type: 'UPPER' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('isUpperExpression - valid and invalid', () => {
    asserts.assertEquals(
      isUpperExpression({ type: 'UPPER', args: 'test' }),
      true,
    );
    asserts.assertEquals(isUpperExpression({ type: 'UPPER' }), false);
  });

  //#endregion UPPER Expression Tests

  //#region TRIM Expression Tests

  await t.step('assertTrimExpression - valid with literal string', () => {
    assertTrimExpression({ type: 'TRIM', args: '  hello  ' });
  });

  await t.step('assertTrimExpression - valid with column reference', () => {
    assertTrimExpression(
      { type: 'TRIM', args: '@user_input' },
      ['user_input'],
    );
  });

  await t.step('assertTrimExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertTrimExpression({ type: 'LTRIM' } as any),
      TypeError,
      "Expected 'TRIM'",
    );
  });

  await t.step('assertTrimExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertTrimExpression({ type: 'TRIM' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('isTrimExpression - valid and invalid', () => {
    asserts.assertEquals(
      isTrimExpression({ type: 'TRIM', args: '  test  ' }),
      true,
    );
    asserts.assertEquals(isTrimExpression({ type: 'TRIM' }), false);
  });

  //#endregion TRIM Expression Tests

  //#region LTRIM Expression Tests

  await t.step('assertLTrimExpression - valid with literal string', () => {
    assertLTrimExpression({ type: 'LTRIM', args: '  hello  ' });
  });

  await t.step('assertLTrimExpression - valid with column reference', () => {
    assertLTrimExpression(
      { type: 'LTRIM', args: '@description' },
      ['description'],
    );
  });

  await t.step('assertLTrimExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertLTrimExpression({ type: 'RTRIM' } as any),
      TypeError,
      "Expected 'LTRIM'",
    );
  });

  await t.step('assertLTrimExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertLTrimExpression({ type: 'LTRIM' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('isLTrimExpression - valid and invalid', () => {
    asserts.assertEquals(
      isLTrimExpression({ type: 'LTRIM', args: '  test' }),
      true,
    );
    asserts.assertEquals(isLTrimExpression({ type: 'LTRIM' }), false);
  });

  //#endregion LTRIM Expression Tests

  //#region RTRIM Expression Tests

  await t.step('assertRTrimExpression - valid with literal string', () => {
    assertRTrimExpression({ type: 'RTRIM', args: '  hello  ' });
  });

  await t.step('assertRTrimExpression - valid with column reference', () => {
    assertRTrimExpression({ type: 'RTRIM', args: '@notes' }, ['notes']);
  });

  await t.step('assertRTrimExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertRTrimExpression({ type: 'LTRIM' } as any),
      TypeError,
      "Expected 'RTRIM'",
    );
  });

  await t.step('assertRTrimExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertRTrimExpression({ type: 'RTRIM' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('isRTrimExpression - valid and invalid', () => {
    asserts.assertEquals(
      isRTrimExpression({ type: 'RTRIM', args: 'test  ' }),
      true,
    );
    asserts.assertEquals(isRTrimExpression({ type: 'RTRIM' }), false);
  });

  //#endregion RTRIM Expression Tests

  //#region SUBSTR Expression Tests

  await t.step('assertSubstrExpression - valid with all properties', () => {
    assertSubstrExpression({
      type: 'SUBSTR',
      args: { string: 'Hello World', start: 0, length: 5 },
    });
  });

  await t.step('assertSubstrExpression - valid without length', () => {
    assertSubstrExpression({
      type: 'SUBSTR',
      args: { string: 'Hello World', start: 6 },
    });
  });

  await t.step('assertSubstrExpression - valid with column references', () => {
    assertSubstrExpression(
      {
        type: 'SUBSTR',
        args: { string: '@description', start: 0, length: 100 },
      },
      ['description'],
    );
  });

  await t.step('assertSubstrExpression - valid with column start', () => {
    assertSubstrExpression(
      {
        type: 'SUBSTR',
        args: { string: '@text', start: '@position', length: 50 },
      },
      ['text', 'position'],
    );
  });

  await t.step('assertSubstrExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertSubstrExpression({ type: 'REPLACE' } as any),
      TypeError,
      "Expected 'SUBSTR'",
    );
  });

  await t.step('assertSubstrExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertSubstrExpression({ type: 'SUBSTR' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertSubstrExpression - invalid: args not object', () => {
    asserts.assertThrows(
      () => assertSubstrExpression({ type: 'SUBSTR', args: 'invalid' } as any),
      TypeError,
      "'args' must be an object for SUBSTR",
    );
  });

  await t.step('assertSubstrExpression - invalid: missing string', () => {
    asserts.assertThrows(
      () =>
        assertSubstrExpression({
          type: 'SUBSTR',
          args: { start: 0, length: 5 },
        } as any),
      TypeError,
      "Missing 'string' property",
    );
  });

  await t.step('assertSubstrExpression - invalid: missing start', () => {
    asserts.assertThrows(
      () =>
        assertSubstrExpression({
          type: 'SUBSTR',
          args: { string: 'test', length: 5 },
        } as any),
      TypeError,
      "Missing 'start' property",
    );
  });

  await t.step('assertSubstrExpression - invalid: string not string', () => {
    asserts.assertThrows(
      () =>
        assertSubstrExpression({
          type: 'SUBSTR',
          args: { string: 123, start: 0 },
        } as any),
      TypeError,
      'string must be a string or column identifier',
    );
  });

  await t.step('assertSubstrExpression - invalid: start not number', () => {
    asserts.assertThrows(
      () =>
        assertSubstrExpression({
          type: 'SUBSTR',
          args: { string: 'test', start: 'zero' },
        } as any),
      TypeError,
      'start must be a number or column identifier',
    );
  });

  await t.step(
    'assertSubstrExpression - invalid: invalid string column',
    () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            type: 'SUBSTR',
            args: { string: '@invalid', start: 0 },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for string',
      );
    },
  );

  await t.step('assertSubstrExpression - invalid: invalid start column', () => {
    asserts.assertThrows(
      () =>
        assertSubstrExpression({
          type: 'SUBSTR',
          args: { string: 'test', start: '@invalid' },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for start',
    );
  });

  await t.step('assertSubstrExpression - invalid: start is boolean', () => {
    asserts.assertThrows(
      () =>
        assertSubstrExpression({
          type: 'SUBSTR',
          args: { string: 'test', start: true },
        } as any),
      TypeError,
      'start must be a number or column identifier',
    );
  });

  await t.step('isSubstrExpression - valid and invalid', () => {
    asserts.assertEquals(
      isSubstrExpression({
        type: 'SUBSTR',
        args: { string: 'test', start: 0 },
      }),
      true,
    );
    asserts.assertEquals(
      isSubstrExpression({
        type: 'SUBSTR',
        args: { string: 'test' },
      }),
      false,
    );
  });

  //#endregion SUBSTR Expression Tests

  //#region REPLACE Expression Tests

  await t.step('assertReplaceExpression - valid with literal strings', () => {
    assertReplaceExpression({
      type: 'REPLACE',
      args: { string: 'Hello World', search: 'World', replace: 'There' },
    });
  });

  await t.step('assertReplaceExpression - valid with column references', () => {
    assertReplaceExpression(
      {
        type: 'REPLACE',
        args: { string: '@description', search: 'old', replace: 'new' },
      },
      ['description'],
    );
  });

  await t.step('assertReplaceExpression - valid with empty replace', () => {
    assertReplaceExpression({
      type: 'REPLACE',
      args: { string: '@phone', search: '-', replace: '' },
    });
  });

  await t.step('assertReplaceExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertReplaceExpression({ type: 'SUBSTR' } as any),
      TypeError,
      "Expected 'REPLACE'",
    );
  });

  await t.step('assertReplaceExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertReplaceExpression({ type: 'REPLACE' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertReplaceExpression - invalid: missing string', () => {
    asserts.assertThrows(
      () =>
        assertReplaceExpression({
          type: 'REPLACE',
          args: { search: 'old', replace: 'new' },
        } as any),
      TypeError,
      "Missing 'string' property",
    );
  });

  await t.step('assertReplaceExpression - invalid: missing search', () => {
    asserts.assertThrows(
      () =>
        assertReplaceExpression({
          type: 'REPLACE',
          args: { string: 'test', replace: 'new' },
        } as any),
      TypeError,
      "Missing 'search' property",
    );
  });

  await t.step('assertReplaceExpression - invalid: missing replace', () => {
    asserts.assertThrows(
      () =>
        assertReplaceExpression({
          type: 'REPLACE',
          args: { string: 'test', search: 'old' },
        } as any),
      TypeError,
      "Missing 'replace' property",
    );
  });

  await t.step('assertReplaceExpression - invalid: args is null', () => {
    asserts.assertThrows(
      () =>
        assertReplaceExpression({
          type: 'REPLACE',
          args: null,
        } as any),
      TypeError,
      "'args' must be an object",
    );
  });

  await t.step('assertReplaceExpression - invalid: string not string', () => {
    asserts.assertThrows(
      () =>
        assertReplaceExpression({
          type: 'REPLACE',
          args: { string: 123, search: 'old', replace: 'new' },
        } as any),
      TypeError,
      'string must be a string or column identifier',
    );
  });

  await t.step(
    'assertReplaceExpression - invalid: invalid string column',
    () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            type: 'REPLACE',
            args: { string: '@invalid', search: 'old', replace: 'new' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for string',
      );
    },
  );

  await t.step(
    'assertReplaceExpression - invalid: invalid search column',
    () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            type: 'REPLACE',
            args: { string: 'test', search: '@invalid', replace: 'new' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for search',
      );
    },
  );

  await t.step(
    'assertReplaceExpression - invalid: invalid replace column',
    () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            type: 'REPLACE',
            args: { string: 'test', search: 'old', replace: '@invalid' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for replace',
      );
    },
  );

  await t.step('isReplaceExpression - valid and invalid', () => {
    asserts.assertEquals(
      isReplaceExpression({
        type: 'REPLACE',
        args: { string: 'test', search: 'e', replace: 'a' },
      }),
      true,
    );
    asserts.assertEquals(
      isReplaceExpression({
        type: 'REPLACE',
        args: { string: 'test', search: 'e' },
      }),
      false,
    );
  });

  //#endregion REPLACE Expression Tests

  //#region LPAD Expression Tests

  await t.step('assertLPadExpression - valid with spaces (no fill)', () => {
    assertLPadExpression({
      type: 'LPAD',
      args: { string: '42', length: 5 },
    });
  });

  await t.step('assertLPadExpression - valid with custom fill', () => {
    assertLPadExpression({
      type: 'LPAD',
      args: { string: '42', length: 5, fill: '0' },
    });
  });

  await t.step('assertLPadExpression - valid with column references', () => {
    assertLPadExpression(
      {
        type: 'LPAD',
        args: { string: '@order_number', length: 10, fill: '0' },
      },
      ['order_number'],
    );
  });

  await t.step('assertLPadExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertLPadExpression({ type: 'RPAD' } as any),
      TypeError,
      "Expected 'LPAD'",
    );
  });

  await t.step('assertLPadExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertLPadExpression({ type: 'LPAD' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertLPadExpression - invalid: args is null', () => {
    asserts.assertThrows(
      () => assertLPadExpression({ type: 'LPAD', args: null } as any),
      TypeError,
      "'args' must be an object",
    );
  });

  await t.step('assertLPadExpression - invalid: missing string', () => {
    asserts.assertThrows(
      () =>
        assertLPadExpression({
          type: 'LPAD',
          args: { length: 5 },
        } as any),
      TypeError,
      "Missing 'string' property",
    );
  });

  await t.step('assertLPadExpression - invalid: missing length', () => {
    asserts.assertThrows(
      () =>
        assertLPadExpression({
          type: 'LPAD',
          args: { string: '42' },
        } as any),
      TypeError,
      "Missing 'length' property",
    );
  });

  await t.step('assertLPadExpression - invalid: length not number', () => {
    asserts.assertThrows(
      () =>
        assertLPadExpression({
          type: 'LPAD',
          args: { string: '42', length: 'five' },
        } as any),
      TypeError,
      'length must be a number or column identifier',
    );
  });

  await t.step('assertLPadExpression - invalid: string not string', () => {
    asserts.assertThrows(
      () =>
        assertLPadExpression({
          type: 'LPAD',
          args: { string: 789, length: 5 },
        } as any),
      TypeError,
      'string must be a string or column identifier',
    );
  });

  await t.step('assertLPadExpression - invalid: invalid string column', () => {
    asserts.assertThrows(
      () =>
        assertLPadExpression({
          type: 'LPAD',
          args: { string: '@invalid', length: 5 },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for string',
    );
  });

  await t.step('assertLPadExpression - invalid: invalid length column', () => {
    asserts.assertThrows(
      () =>
        assertLPadExpression({
          type: 'LPAD',
          args: { string: 'test', length: '@invalid' },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for length',
    );
  });

  await t.step('assertLPadExpression - invalid: invalid fill column', () => {
    asserts.assertThrows(
      () =>
        assertLPadExpression({
          type: 'LPAD',
          args: { string: 'test', length: 5, fill: '@invalid' },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for fill',
    );
  });

  await t.step('isLPadExpression - valid and invalid', () => {
    asserts.assertEquals(
      isLPadExpression({
        type: 'LPAD',
        args: { string: '42', length: 5 },
      }),
      true,
    );
    asserts.assertEquals(
      isLPadExpression({
        type: 'LPAD',
        args: { string: '42' },
      }),
      false,
    );
  });

  //#endregion LPAD Expression Tests

  //#region RPAD Expression Tests

  await t.step('assertRPadExpression - valid with spaces (no fill)', () => {
    assertRPadExpression({
      type: 'RPAD',
      args: { string: '42', length: 5 },
    });
  });

  await t.step('assertRPadExpression - valid with custom fill', () => {
    assertRPadExpression({
      type: 'RPAD',
      args: { string: 'LOG', length: 10, fill: '.' },
    });
  });

  await t.step('assertRPadExpression - valid with column references', () => {
    assertRPadExpression(
      {
        type: 'RPAD',
        args: { string: '@status', length: 15, fill: ' ' },
      },
      ['status'],
    );
  });

  await t.step('assertRPadExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertRPadExpression({ type: 'LPAD' } as any),
      TypeError,
      "Expected 'RPAD'",
    );
  });

  await t.step('assertRPadExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertRPadExpression({ type: 'RPAD' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertRPadExpression - invalid: args is null', () => {
    asserts.assertThrows(
      () => assertRPadExpression({ type: 'RPAD', args: null } as any),
      TypeError,
      "'args' must be an object",
    );
  });

  await t.step('assertRPadExpression - invalid: missing string', () => {
    asserts.assertThrows(
      () =>
        assertRPadExpression({
          type: 'RPAD',
          args: { length: 5 },
        } as any),
      TypeError,
      "Missing 'string' property",
    );
  });

  await t.step('assertRPadExpression - invalid: missing length', () => {
    asserts.assertThrows(
      () =>
        assertRPadExpression({
          type: 'RPAD',
          args: { string: '42' },
        } as any),
      TypeError,
      "Missing 'length' property",
    );
  });

  await t.step('assertRPadExpression - invalid: string not string', () => {
    asserts.assertThrows(
      () =>
        assertRPadExpression({
          type: 'RPAD',
          args: { string: 456, length: 5 },
        } as any),
      TypeError,
      'string must be a string or column identifier',
    );
  });

  await t.step('assertRPadExpression - invalid: length not number', () => {
    asserts.assertThrows(
      () =>
        assertRPadExpression({
          type: 'RPAD',
          args: { string: 'test', length: 'ten' },
        } as any),
      TypeError,
      'length must be a number or column identifier',
    );
  });

  await t.step('assertRPadExpression - invalid: invalid string column', () => {
    asserts.assertThrows(
      () =>
        assertRPadExpression({
          type: 'RPAD',
          args: { string: '@invalid', length: 5 },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for string',
    );
  });

  await t.step('assertRPadExpression - invalid: invalid length column', () => {
    asserts.assertThrows(
      () =>
        assertRPadExpression({
          type: 'RPAD',
          args: { string: 'test', length: '@invalid' },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for length',
    );
  });

  await t.step('assertRPadExpression - invalid: invalid fill column', () => {
    asserts.assertThrows(
      () =>
        assertRPadExpression({
          type: 'RPAD',
          args: { string: 'test', length: 5, fill: '@invalid' },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for fill',
    );
  });

  await t.step('isRPadExpression - valid and invalid', () => {
    asserts.assertEquals(
      isRPadExpression({
        type: 'RPAD',
        args: { string: '42', length: 5 },
      }),
      true,
    );
    asserts.assertEquals(
      isRPadExpression({
        type: 'RPAD',
        args: { string: '42' },
      }),
      false,
    );
  });

  //#endregion RPAD Expression Tests

  //#region ENCRYPT Expression Tests

  await t.step('assertEncryptExpression - valid with literals', () => {
    assertEncryptExpression({
      type: 'ENCRYPT',
      args: { secret: 'my-key', data: 'sensitive' },
    });
  });

  await t.step('assertEncryptExpression - valid with column references', () => {
    assertEncryptExpression(
      {
        type: 'ENCRYPT',
        args: { secret: 'key', data: '@ssn' },
      },
      ['ssn'],
    );
  });

  await t.step('assertEncryptExpression - valid with numeric data', () => {
    assertEncryptExpression({
      type: 'ENCRYPT',
      args: { secret: 'key', data: 123 },
    });
  });

  await t.step('assertEncryptExpression - valid with Date data', () => {
    assertEncryptExpression({
      type: 'ENCRYPT',
      args: { secret: 'key', data: new Date() },
    });
  });

  await t.step('assertEncryptExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertEncryptExpression({ type: 'DECRYPT' } as any),
      TypeError,
      "Expected 'ENCRYPT'",
    );
  });

  await t.step('assertEncryptExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertEncryptExpression({ type: 'ENCRYPT' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertEncryptExpression - invalid: args is null', () => {
    asserts.assertThrows(
      () => assertEncryptExpression({ type: 'ENCRYPT', args: null } as any),
      TypeError,
      "'args' must be an object",
    );
  });

  await t.step('assertEncryptExpression - invalid: missing secret', () => {
    asserts.assertThrows(
      () =>
        assertEncryptExpression({
          type: 'ENCRYPT',
          args: { data: 'test' },
        } as any),
      TypeError,
      "Missing 'secret' property",
    );
  });

  await t.step('assertEncryptExpression - invalid: missing data', () => {
    asserts.assertThrows(
      () =>
        assertEncryptExpression({
          type: 'ENCRYPT',
          args: { secret: 'key' },
        } as any),
      TypeError,
      "Missing 'data' property",
    );
  });

  await t.step('assertEncryptExpression - invalid: secret not string', () => {
    asserts.assertThrows(
      () =>
        assertEncryptExpression({
          type: 'ENCRYPT',
          args: { secret: 123, data: 'test' },
        } as any),
      TypeError,
      'secret must be a string or column identifier',
    );
  });

  await t.step(
    'assertEncryptExpression - invalid: invalid secret column',
    () => {
      asserts.assertThrows(
        () =>
          assertEncryptExpression({
            type: 'ENCRYPT',
            args: { secret: '@invalid', data: 'test' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for secret',
      );
    },
  );

  await t.step('assertEncryptExpression - invalid: invalid data column', () => {
    asserts.assertThrows(
      () =>
        assertEncryptExpression({
          type: 'ENCRYPT',
          args: { secret: 'key', data: '@invalid' },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for data',
    );
  });

  await t.step('isEncryptExpression - valid and invalid', () => {
    asserts.assertEquals(
      isEncryptExpression({
        type: 'ENCRYPT',
        args: { secret: 'key', data: 'test' },
      }),
      true,
    );
    asserts.assertEquals(
      isEncryptExpression({
        type: 'ENCRYPT',
        args: { secret: 'key' },
      }),
      false,
    );
  });

  //#endregion ENCRYPT Expression Tests

  //#region DECRYPT Expression Tests

  await t.step('assertDecryptExpression - valid with literals', () => {
    assertDecryptExpression({
      type: 'DECRYPT',
      args: { secret: 'my-key', data: 'encrypted-data' },
    });
  });

  await t.step('assertDecryptExpression - valid with column references', () => {
    assertDecryptExpression(
      {
        type: 'DECRYPT',
        args: { secret: 'key', data: '@encrypted_ssn' },
      },
      ['encrypted_ssn'],
    );
  });

  await t.step('assertDecryptExpression - valid with column secret', () => {
    assertDecryptExpression(
      {
        type: 'DECRYPT',
        args: { secret: '@user_key', data: '@encrypted_data' },
      },
      ['user_key', 'encrypted_data'],
    );
  });

  await t.step('assertDecryptExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertDecryptExpression({ type: 'ENCRYPT' } as any),
      TypeError,
      "Expected 'DECRYPT'",
    );
  });

  await t.step('assertDecryptExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertDecryptExpression({ type: 'DECRYPT' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertDecryptExpression - invalid: args is null', () => {
    asserts.assertThrows(
      () => assertDecryptExpression({ type: 'DECRYPT', args: null } as any),
      TypeError,
      "'args' must be an object",
    );
  });

  await t.step('assertDecryptExpression - invalid: missing secret', () => {
    asserts.assertThrows(
      () =>
        assertDecryptExpression({
          type: 'DECRYPT',
          args: { data: 'test' },
        } as any),
      TypeError,
      "Missing 'secret' property",
    );
  });

  await t.step('assertDecryptExpression - invalid: missing data', () => {
    asserts.assertThrows(
      () =>
        assertDecryptExpression({
          type: 'DECRYPT',
          args: { secret: 'key' },
        } as any),
      TypeError,
      "Missing 'data' property",
    );
  });

  await t.step('assertDecryptExpression - invalid: secret not string', () => {
    asserts.assertThrows(
      () =>
        assertDecryptExpression({
          type: 'DECRYPT',
          args: { secret: 456, data: 'test' },
        } as any),
      TypeError,
      'secret must be a string or column identifier',
    );
  });

  await t.step(
    'assertDecryptExpression - invalid: invalid secret column',
    () => {
      asserts.assertThrows(
        () =>
          assertDecryptExpression({
            type: 'DECRYPT',
            args: { secret: '@invalid', data: 'test' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for secret',
      );
    },
  );

  await t.step('assertDecryptExpression - invalid: invalid data column', () => {
    asserts.assertThrows(
      () =>
        assertDecryptExpression({
          type: 'DECRYPT',
          args: { secret: 'key', data: '@invalid' },
        }, ['valid']),
      TypeError,
      'Invalid column identifier @invalid for data',
    );
  });

  await t.step('isDecryptExpression - valid and invalid', () => {
    asserts.assertEquals(
      isDecryptExpression({
        type: 'DECRYPT',
        args: { secret: 'key', data: 'test' },
      }),
      true,
    );
    asserts.assertEquals(
      isDecryptExpression({
        type: 'DECRYPT',
        args: { secret: 'key' },
      }),
      false,
    );
  });

  //#endregion DECRYPT Expression Tests

  //#region HASH Expression Tests

  await t.step('assertHashExpression - valid with string literal', () => {
    assertHashExpression({ type: 'HASH', args: 'sensitive-data' });
  });

  await t.step('assertHashExpression - valid with column reference', () => {
    assertHashExpression({ type: 'HASH', args: '@password' }, ['password']);
  });

  await t.step('assertHashExpression - valid with number', () => {
    assertHashExpression({ type: 'HASH', args: 123 });
  });

  await t.step('assertHashExpression - valid with bigint', () => {
    assertHashExpression({ type: 'HASH', args: 123n });
  });

  await t.step('assertHashExpression - valid with boolean', () => {
    assertHashExpression({ type: 'HASH', args: true });
  });

  await t.step('assertHashExpression - valid with Date', () => {
    assertHashExpression({ type: 'HASH', args: new Date() });
  });

  await t.step('assertHashExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertHashExpression({ type: 'ENCRYPT' } as any),
      TypeError,
      "Expected 'HASH'",
    );
  });

  await t.step('assertHashExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertHashExpression({ type: 'HASH' } as any),
      TypeError,
      "Missing 'args' property",
    );
  });

  await t.step('assertHashExpression - invalid: object arg', () => {
    asserts.assertThrows(
      () => assertHashExpression({ type: 'HASH', args: { foo: 'bar' } } as any),
      TypeError,
      'args must be a string, number, bigint, Date, boolean, or column identifier',
    );
  });

  await t.step('assertHashExpression - invalid: invalid column', () => {
    asserts.assertThrows(
      () =>
        assertHashExpression(
          { type: 'HASH', args: '@invalid' },
          ['password', 'email'],
        ),
      TypeError,
      'Invalid column identifier',
    );
  });

  await t.step('isHashExpression - valid and invalid', () => {
    asserts.assertEquals(
      isHashExpression({ type: 'HASH', args: 'test' }),
      true,
    );
    asserts.assertEquals(isHashExpression({ type: 'HASH', args: {} }), false);
  });

  //#endregion HASH Expression Tests

  //#region assertStringExpression Tests

  await t.step('assertStringExpression - delegates to UUID', () => {
    assertStringExpression({ type: 'UUID' });
  });

  await t.step('assertStringExpression - delegates to CONCAT', () => {
    assertStringExpression({ type: 'CONCAT', args: ['a', 'b'] });
  });

  await t.step('assertStringExpression - delegates to LOWER', () => {
    assertStringExpression({ type: 'LOWER', args: 'test' });
  });

  await t.step('assertStringExpression - delegates to UPPER', () => {
    assertStringExpression({ type: 'UPPER', args: 'test' });
  });

  await t.step('assertStringExpression - delegates to TRIM', () => {
    assertStringExpression({ type: 'TRIM', args: '  test  ' });
  });

  await t.step('assertStringExpression - delegates to LTRIM', () => {
    assertStringExpression({ type: 'LTRIM', args: '  test' });
  });

  await t.step('assertStringExpression - delegates to RTRIM', () => {
    assertStringExpression({ type: 'RTRIM', args: 'test  ' });
  });

  await t.step('assertStringExpression - delegates to SUBSTR', () => {
    assertStringExpression({
      type: 'SUBSTR',
      args: { string: 'test', start: 0 },
    });
  });

  await t.step('assertStringExpression - delegates to REPLACE', () => {
    assertStringExpression({
      type: 'REPLACE',
      args: { string: 'test', search: 'e', replace: 'a' },
    });
  });

  await t.step('assertStringExpression - delegates to LPAD', () => {
    assertStringExpression({
      type: 'LPAD',
      args: { string: '42', length: 5 },
    });
  });

  await t.step('assertStringExpression - delegates to RPAD', () => {
    assertStringExpression({
      type: 'RPAD',
      args: { string: '42', length: 5 },
    });
  });

  await t.step('assertStringExpression - delegates to ENCRYPT', () => {
    assertStringExpression({
      type: 'ENCRYPT',
      args: { secret: 'key', data: 'test' },
    });
  });

  await t.step('assertStringExpression - delegates to DECRYPT', () => {
    assertStringExpression({
      type: 'DECRYPT',
      args: { secret: 'key', data: 'test' },
    });
  });

  await t.step('assertStringExpression - delegates to HASH', () => {
    assertStringExpression({ type: 'HASH', args: 'test' });
  });

  await t.step('assertStringExpression - invalid: non-string type', () => {
    asserts.assertThrows(
      () => assertStringExpression({ type: 'ADD' } as any),
      TypeError,
      "Expected a String expression type, got 'ADD'",
    );
  });

  await t.step('assertStringExpression - invalid: numeric expression', () => {
    asserts.assertThrows(
      () => assertStringExpression({ type: 'MULTIPLY', args: [2, 3] } as any),
      TypeError,
      "Expected a String expression type, got 'MULTIPLY'",
    );
  });

  //#endregion assertStringExpression Tests

  //#region isStringExpression Tests

  await t.step('isStringExpression - valid string expressions', () => {
    asserts.assertEquals(isStringExpression({ type: 'UUID' }), true);
    asserts.assertEquals(
      isStringExpression({ type: 'CONCAT', args: ['a', 'b'] }),
      true,
    );
    asserts.assertEquals(
      isStringExpression({ type: 'LOWER', args: 'test' }),
      true,
    );
    asserts.assertEquals(
      isStringExpression({ type: 'UPPER', args: 'test' }),
      true,
    );
    asserts.assertEquals(
      isStringExpression({
        type: 'SUBSTR',
        args: { string: 'test', start: 0 },
      }),
      true,
    );
    asserts.assertEquals(
      isStringExpression({ type: 'HASH', args: 'test' }),
      true,
    );
  });

  await t.step('isStringExpression - invalid expressions', () => {
    asserts.assertEquals(
      isStringExpression({ type: 'ADD', args: [1, 2] }),
      false,
    );
    asserts.assertEquals(
      isStringExpression({ type: 'NOW' }),
      false,
    );
    asserts.assertEquals(
      isStringExpression({ type: 'INVALID' }),
      false,
    );
  });

  //#endregion isStringExpression Tests

  //#region Integration Tests

  await t.step('Integration: filter string expressions', () => {
    const expressions: unknown[] = [
      { type: 'UUID' },
      { type: 'ADD', args: [1, 2] },
      { type: 'CONCAT', args: ['a', 'b'] },
      { type: 'NOW' },
      { type: 'LOWER', args: 'test' },
      'invalid',
    ];

    const stringExpressions = expressions.filter((x) => isStringExpression(x));

    asserts.assertEquals(stringExpressions.length, 3);
    asserts.assertEquals(stringExpressions[0], { type: 'UUID' });
    asserts.assertEquals(stringExpressions[1], {
      type: 'CONCAT',
      args: ['a', 'b'],
    });
    asserts.assertEquals(stringExpressions[2], {
      type: 'LOWER',
      args: 'test',
    });
  });

  await t.step('Integration: validate with column list', () => {
    const columns = ['first_name', 'last_name', 'email', 'username'];

    // Valid column usage
    assertStringExpression(
      { type: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
      columns,
    );

    assertStringExpression(
      { type: 'LOWER', args: '@email' },
      columns,
    );

    // Invalid column
    asserts.assertThrows(
      () =>
        assertStringExpression(
          { type: 'UPPER', args: '@invalid' },
          columns,
        ),
      TypeError,
    );
  });

  await t.step('Integration: complex string operations', () => {
    const columns = ['description', 'template', 'user_name'];

    // SUBSTR with columns
    assertStringExpression(
      {
        type: 'SUBSTR',
        args: { string: '@description', start: 0, length: 100 },
      },
      columns,
    );

    // REPLACE with dynamic replacement
    assertStringExpression(
      {
        type: 'REPLACE',
        args: {
          string: '@template',
          search: '{{name}}',
          replace: '@user_name',
        },
      },
      columns,
    );
  });

  await t.step('Integration: type narrowing with isStringExpression', () => {
    const expr: unknown = { type: 'CONCAT', args: ['Hello', ' ', 'World'] };

    if (isStringExpression(expr)) {
      // TypeScript narrows to string expression
      asserts.assertEquals(expr.type, 'CONCAT');
    }
  });

  //#endregion Integration Tests
});

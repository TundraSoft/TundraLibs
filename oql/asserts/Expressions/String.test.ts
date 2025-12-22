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
  await t.step('UUID expression', async (u) => {
    await u.step('valid: basic UUID', () => {
      assertUUIDExpression({ type: 'UUID' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertUUIDExpression({ type: 'CONCAT' } as any),
        TypeError,
        "Expected 'UUID'",
      );
    });

    await u.step('isUUIDExpression type guard', () => {
      asserts.assertEquals(isUUIDExpression({ type: 'UUID' }), true);
      asserts.assertEquals(isUUIDExpression({ type: 'CONCAT' }), false);
    });
  });

  await t.step('CONCAT expression', async (u) => {
    await u.step('valid: literal strings', () => {
      assertConcatExpression({ type: 'CONCAT', args: ['Hello', ' ', 'World'] });
    });

    await u.step('valid: single string', () => {
      assertConcatExpression({ type: 'CONCAT', args: ['Hello'] });
    });

    await u.step('valid: column references', () => {
      assertConcatExpression(
        { type: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
        ['first_name', 'last_name'],
      );
    });

    await u.step('valid: mixed types', () => {
      assertConcatExpression(
        { type: 'CONCAT', args: ['User: ', '@username', ' (', '@email', ')'] },
        ['username', 'email'],
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertConcatExpression({ type: 'LOWER' } as any),
        TypeError,
        "Expected 'CONCAT'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertConcatExpression({ type: 'CONCAT' } as any),
        TypeError,
        "'args' must be a non-empty array for CONCAT",
      );
    });

    await u.step('invalid: empty args array', () => {
      asserts.assertThrows(
        () => assertConcatExpression({ type: 'CONCAT', args: [] } as any),
        TypeError,
        "'args' must be a non-empty array for CONCAT",
      );
    });

    await u.step('invalid: non-string arg', () => {
      asserts.assertThrows(
        () => assertConcatExpression({ type: 'CONCAT', args: [123] } as any),
        TypeError,
        'Invalid argument',
      );
    });

    await u.step('invalid: invalid column', () => {
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

    await u.step('invalid: number with column list', () => {
      asserts.assertThrows(
        () =>
          assertConcatExpression(
            { type: 'CONCAT', args: ['@col', 123] },
            ['col'],
          ),
        TypeError,
        'Invalid argument 123 in CONCAT expression',
      );
    });

    await u.step('isConcatExpression type guard', () => {
      asserts.assertEquals(
        isConcatExpression({ type: 'CONCAT', args: ['a', 'b'] }),
        true,
      );
      asserts.assertEquals(
        isConcatExpression({ type: 'CONCAT', args: [] }),
        false,
      );
    });
  });

  await t.step('LOWER expression', async (u) => {
    await u.step('valid: literal string', () => {
      assertLowerExpression({ type: 'LOWER', args: 'HELLO' });
    });

    await u.step('valid: column reference', () => {
      assertLowerExpression({ type: 'LOWER', args: '@email' }, ['email']);
    });

    await u.step('valid: empty string', () => {
      assertLowerExpression({ type: 'LOWER', args: '' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertLowerExpression({ type: 'UPPER' } as any),
        TypeError,
        "Expected 'LOWER'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertLowerExpression({ type: 'LOWER' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: numeric arg', () => {
      asserts.assertThrows(
        () => assertLowerExpression({ type: 'LOWER', args: 123 } as any),
        TypeError,
        'Invalid',
      );
    });

    await u.step('isLowerExpression type guard', () => {
      asserts.assertEquals(
        isLowerExpression({ type: 'LOWER', args: 'test' }),
        true,
      );
      asserts.assertEquals(
        isLowerExpression({ type: 'LOWER', args: 123 }),
        false,
      );
    });
  });

  await t.step('UPPER expression', async (u) => {
    await u.step('valid: literal string', () => {
      assertUpperExpression({ type: 'UPPER', args: 'hello' });
    });

    await u.step('valid: column reference', () => {
      assertUpperExpression(
        { type: 'UPPER', args: '@country_code' },
        ['country_code'],
      );
    });

    await u.step('valid: empty string', () => {
      assertUpperExpression({ type: 'UPPER', args: '' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertUpperExpression({ type: 'LOWER' } as any),
        TypeError,
        "Expected 'UPPER'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertUpperExpression({ type: 'UPPER' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('isUpperExpression type guard', () => {
      asserts.assertEquals(
        isUpperExpression({ type: 'UPPER', args: 'test' }),
        true,
      );
      asserts.assertEquals(isUpperExpression({ type: 'UPPER' }), false);
    });
  });

  await t.step('TRIM expression', async (u) => {
    await u.step('valid: literal string', () => {
      assertTrimExpression({ type: 'TRIM', args: '  hello  ' });
    });

    await u.step('valid: column reference', () => {
      assertTrimExpression(
        { type: 'TRIM', args: '@user_input' },
        ['user_input'],
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertTrimExpression({ type: 'LTRIM' } as any),
        TypeError,
        "Expected 'TRIM'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertTrimExpression({ type: 'TRIM' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('isTrimExpression type guard', () => {
      asserts.assertEquals(
        isTrimExpression({ type: 'TRIM', args: '  test  ' }),
        true,
      );
      asserts.assertEquals(isTrimExpression({ type: 'TRIM' }), false);
    });
  });

  await t.step('LTRIM expression', async (u) => {
    await u.step('valid: literal string', () => {
      assertLTrimExpression({ type: 'LTRIM', args: '  hello  ' });
    });

    await u.step('valid: column reference', () => {
      assertLTrimExpression(
        { type: 'LTRIM', args: '@description' },
        ['description'],
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertLTrimExpression({ type: 'RTRIM' } as any),
        TypeError,
        "Expected 'LTRIM'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertLTrimExpression({ type: 'LTRIM' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('isLTrimExpression type guard', () => {
      asserts.assertEquals(
        isLTrimExpression({ type: 'LTRIM', args: '  test' }),
        true,
      );
      asserts.assertEquals(isLTrimExpression({ type: 'LTRIM' }), false);
    });
  });

  await t.step('RTRIM expression', async (u) => {
    await u.step('valid: literal string', () => {
      assertRTrimExpression({ type: 'RTRIM', args: '  hello  ' });
    });

    await u.step('valid: column reference', () => {
      assertRTrimExpression({ type: 'RTRIM', args: '@notes' }, ['notes']);
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertRTrimExpression({ type: 'LTRIM' } as any),
        TypeError,
        "Expected 'RTRIM'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertRTrimExpression({ type: 'RTRIM' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('isRTrimExpression type guard', () => {
      asserts.assertEquals(
        isRTrimExpression({ type: 'RTRIM', args: 'test  ' }),
        true,
      );
      asserts.assertEquals(isRTrimExpression({ type: 'RTRIM' }), false);
    });
  });

  await t.step('SUBSTR expression', async (u) => {
    await u.step('valid: all properties', () => {
      assertSubstrExpression({
        type: 'SUBSTR',
        args: { string: 'Hello World', start: 0, length: 5 },
      });
    });

    await u.step('valid: without length', () => {
      assertSubstrExpression({
        type: 'SUBSTR',
        args: { string: 'Hello World', start: 6 },
      });
    });

    await u.step('valid: column references', () => {
      assertSubstrExpression(
        {
          type: 'SUBSTR',
          args: { string: '@description', start: 0, length: 100 },
        },
        ['description'],
      );
    });

    await u.step('valid: column start', () => {
      assertSubstrExpression(
        {
          type: 'SUBSTR',
          args: { string: '@text', start: '@position', length: 50 },
        },
        ['text', 'position'],
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertSubstrExpression({ type: 'REPLACE' } as any),
        TypeError,
        "Expected 'SUBSTR'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertSubstrExpression({ type: 'SUBSTR' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: args not object', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({ type: 'SUBSTR', args: 'invalid' } as any),
        TypeError,
        "'args' must be an object for SUBSTR",
      );
    });

    await u.step('invalid: missing string', () => {
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

    await u.step('invalid: missing start', () => {
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

    await u.step('invalid: string not string', () => {
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

    await u.step('invalid: start not number', () => {
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

    await u.step('invalid: invalid string column', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            type: 'SUBSTR',
            args: { string: '@invalid', start: 0 },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for string',
      );
    });

    await u.step('invalid: invalid start column', () => {
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

    await u.step('invalid: start is boolean', () => {
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

    await u.step('isSubstrExpression type guard', () => {
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
  });

  await t.step('REPLACE expression', async (u) => {
    await u.step('valid: literal strings', () => {
      assertReplaceExpression({
        type: 'REPLACE',
        args: { string: 'Hello World', search: 'World', replace: 'There' },
      });
    });

    await u.step('valid: column references', () => {
      assertReplaceExpression(
        {
          type: 'REPLACE',
          args: { string: '@description', search: 'old', replace: 'new' },
        },
        ['description'],
      );
    });

    await u.step('valid: empty replace', () => {
      assertReplaceExpression({
        type: 'REPLACE',
        args: { string: '@phone', search: '-', replace: '' },
      });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertReplaceExpression({ type: 'SUBSTR' } as any),
        TypeError,
        "Expected 'REPLACE'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertReplaceExpression({ type: 'REPLACE' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: missing string', () => {
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

    await u.step('invalid: missing search', () => {
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

    await u.step('invalid: missing replace', () => {
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

    await u.step('invalid: args is null', () => {
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

    await u.step('invalid: string not string', () => {
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

    await u.step('invalid: invalid string column', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            type: 'REPLACE',
            args: { string: '@invalid', search: 'old', replace: 'new' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for string',
      );
    });

    await u.step('invalid: invalid search column', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            type: 'REPLACE',
            args: { string: 'test', search: '@invalid', replace: 'new' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for search',
      );
    });

    await u.step('invalid: invalid replace column', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            type: 'REPLACE',
            args: { string: 'test', search: 'old', replace: '@invalid' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for replace',
      );
    });

    await u.step('isReplaceExpression type guard', () => {
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
  });

  await t.step('LPAD expression', async (u) => {
    await u.step('valid: spaces (no fill)', () => {
      assertLPadExpression({
        type: 'LPAD',
        args: { string: '42', length: 5 },
      });
    });

    await u.step('valid: custom fill', () => {
      assertLPadExpression({
        type: 'LPAD',
        args: { string: '42', length: 5, fill: '0' },
      });
    });

    await u.step('valid: column references', () => {
      assertLPadExpression(
        {
          type: 'LPAD',
          args: { string: '@order_number', length: 10, fill: '0' },
        },
        ['order_number'],
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertLPadExpression({ type: 'RPAD' } as any),
        TypeError,
        "Expected 'LPAD'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertLPadExpression({ type: 'LPAD' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: args is null', () => {
      asserts.assertThrows(
        () => assertLPadExpression({ type: 'LPAD', args: null } as any),
        TypeError,
        "'args' must be an object",
      );
    });

    await u.step('invalid: missing string', () => {
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

    await u.step('invalid: missing length', () => {
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

    await u.step('invalid: length not number', () => {
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

    await u.step('invalid: string not string', () => {
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

    await u.step('invalid: invalid string column', () => {
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

    await u.step('invalid: invalid length column', () => {
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

    await u.step('invalid: invalid fill column', () => {
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

    await u.step('isLPadExpression type guard', () => {
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
  });

  await t.step('RPAD expression', async (u) => {
    await u.step('valid: spaces (no fill)', () => {
      assertRPadExpression({
        type: 'RPAD',
        args: { string: '42', length: 5 },
      });
    });

    await u.step('valid: custom fill', () => {
      assertRPadExpression({
        type: 'RPAD',
        args: { string: 'LOG', length: 10, fill: '.' },
      });
    });

    await u.step('valid: column references', () => {
      assertRPadExpression(
        {
          type: 'RPAD',
          args: { string: '@status', length: 15, fill: ' ' },
        },
        ['status'],
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertRPadExpression({ type: 'LPAD' } as any),
        TypeError,
        "Expected 'RPAD'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertRPadExpression({ type: 'RPAD' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: args is null', () => {
      asserts.assertThrows(
        () => assertRPadExpression({ type: 'RPAD', args: null } as any),
        TypeError,
        "'args' must be an object",
      );
    });

    await u.step('invalid: missing string', () => {
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

    await u.step('invalid: missing length', () => {
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

    await u.step('invalid: string not string', () => {
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

    await u.step('invalid: length not number', () => {
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

    await u.step('invalid: invalid string column', () => {
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

    await u.step('invalid: invalid length column', () => {
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

    await u.step('invalid: invalid fill column', () => {
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

    await u.step('isRPadExpression type guard', () => {
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
  });

  await t.step('ENCRYPT expression', async (u) => {
    await u.step('valid: literals', () => {
      assertEncryptExpression({
        type: 'ENCRYPT',
        args: { secret: 'my-key', data: 'sensitive' },
      });
    });

    await u.step('valid: column references', () => {
      assertEncryptExpression(
        {
          type: 'ENCRYPT',
          args: { secret: 'key', data: '@ssn' },
        },
        ['ssn'],
      );
    });

    await u.step('valid: numeric data', () => {
      assertEncryptExpression({
        type: 'ENCRYPT',
        args: { secret: 'key', data: 123 },
      });
    });

    await u.step('valid: Date data', () => {
      assertEncryptExpression({
        type: 'ENCRYPT',
        args: { secret: 'key', data: new Date() },
      });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertEncryptExpression({ type: 'DECRYPT' } as any),
        TypeError,
        "Expected 'ENCRYPT'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertEncryptExpression({ type: 'ENCRYPT' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: args is null', () => {
      asserts.assertThrows(
        () => assertEncryptExpression({ type: 'ENCRYPT', args: null } as any),
        TypeError,
        "'args' must be an object",
      );
    });

    await u.step('invalid: missing secret', () => {
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

    await u.step('invalid: missing data', () => {
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

    await u.step('invalid: secret not string', () => {
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

    await u.step('invalid: invalid secret column', () => {
      asserts.assertThrows(
        () =>
          assertEncryptExpression({
            type: 'ENCRYPT',
            args: { secret: '@invalid', data: 'test' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for secret',
      );
    });

    await u.step('invalid: invalid data column', () => {
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

    await u.step('isEncryptExpression type guard', () => {
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
  });

  await t.step('DECRYPT expression', async (u) => {
    await u.step('valid: literals', () => {
      assertDecryptExpression({
        type: 'DECRYPT',
        args: { secret: 'my-key', data: 'encrypted-data' },
      });
    });

    await u.step('valid: column references', () => {
      assertDecryptExpression(
        {
          type: 'DECRYPT',
          args: { secret: 'key', data: '@encrypted_ssn' },
        },
        ['encrypted_ssn'],
      );
    });

    await u.step('valid: column secret', () => {
      assertDecryptExpression(
        {
          type: 'DECRYPT',
          args: { secret: '@user_key', data: '@encrypted_data' },
        },
        ['user_key', 'encrypted_data'],
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertDecryptExpression({ type: 'ENCRYPT' } as any),
        TypeError,
        "Expected 'DECRYPT'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertDecryptExpression({ type: 'DECRYPT' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: args is null', () => {
      asserts.assertThrows(
        () => assertDecryptExpression({ type: 'DECRYPT', args: null } as any),
        TypeError,
        "'args' must be an object",
      );
    });

    await u.step('invalid: missing secret', () => {
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

    await u.step('invalid: missing data', () => {
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

    await u.step('invalid: secret not string', () => {
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

    await u.step('invalid: invalid secret column', () => {
      asserts.assertThrows(
        () =>
          assertDecryptExpression({
            type: 'DECRYPT',
            args: { secret: '@invalid', data: 'test' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier @invalid for secret',
      );
    });

    await u.step('invalid: invalid data column', () => {
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

    await u.step('isDecryptExpression type guard', () => {
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
  });

  await t.step('HASH expression', async (u) => {
    await u.step('valid: string literal', () => {
      assertHashExpression({ type: 'HASH', args: 'sensitive-data' });
    });

    await u.step('valid: column reference', () => {
      assertHashExpression({ type: 'HASH', args: '@password' }, ['password']);
    });

    await u.step('valid: number', () => {
      assertHashExpression({ type: 'HASH', args: 123 });
    });

    await u.step('valid: bigint', () => {
      assertHashExpression({ type: 'HASH', args: 123n });
    });

    await u.step('valid: boolean', () => {
      assertHashExpression({ type: 'HASH', args: true });
    });

    await u.step('valid: Date', () => {
      assertHashExpression({ type: 'HASH', args: new Date() });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertHashExpression({ type: 'ENCRYPT' } as any),
        TypeError,
        "Expected 'HASH'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertHashExpression({ type: 'HASH' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    await u.step('invalid: object arg', () => {
      asserts.assertThrows(
        () =>
          assertHashExpression({ type: 'HASH', args: { foo: 'bar' } } as any),
        TypeError,
        'args must be a string, number, bigint, Date, boolean, or column identifier',
      );
    });

    await u.step('invalid: invalid column', () => {
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

    await u.step('isHashExpression type guard', () => {
      asserts.assertEquals(
        isHashExpression({ type: 'HASH', args: 'test' }),
        true,
      );
      asserts.assertEquals(isHashExpression({ type: 'HASH', args: {} }), false);
    });
  });

  await t.step('assertStringExpression', async (u) => {
    await u.step('delegates to UUID', () => {
      assertStringExpression({ type: 'UUID' });
    });

    await u.step('delegates to CONCAT', () => {
      assertStringExpression({ type: 'CONCAT', args: ['a', 'b'] });
    });

    await u.step('delegates to LOWER', () => {
      assertStringExpression({ type: 'LOWER', args: 'test' });
    });

    await u.step('delegates to UPPER', () => {
      assertStringExpression({ type: 'UPPER', args: 'test' });
    });

    await u.step('delegates to TRIM', () => {
      assertStringExpression({ type: 'TRIM', args: '  test  ' });
    });

    await u.step('delegates to LTRIM', () => {
      assertStringExpression({ type: 'LTRIM', args: '  test' });
    });

    await u.step('delegates to RTRIM', () => {
      assertStringExpression({ type: 'RTRIM', args: 'test  ' });
    });

    await u.step('delegates to SUBSTR', () => {
      assertStringExpression({
        type: 'SUBSTR',
        args: { string: 'test', start: 0 },
      });
    });

    await u.step('delegates to REPLACE', () => {
      assertStringExpression({
        type: 'REPLACE',
        args: { string: 'test', search: 'e', replace: 'a' },
      });
    });

    await u.step('delegates to LPAD', () => {
      assertStringExpression({
        type: 'LPAD',
        args: { string: '42', length: 5 },
      });
    });

    await u.step('delegates to RPAD', () => {
      assertStringExpression({
        type: 'RPAD',
        args: { string: '42', length: 5 },
      });
    });

    await u.step('delegates to ENCRYPT', () => {
      assertStringExpression({
        type: 'ENCRYPT',
        args: { secret: 'key', data: 'test' },
      });
    });

    await u.step('delegates to DECRYPT', () => {
      assertStringExpression({
        type: 'DECRYPT',
        args: { secret: 'key', data: 'test' },
      });
    });

    await u.step('delegates to HASH', () => {
      assertStringExpression({ type: 'HASH', args: 'test' });
    });

    await u.step('invalid: non-string type', () => {
      asserts.assertThrows(
        () => assertStringExpression({ type: 'ADD' } as any),
        TypeError,
        "Expected a String expression type, got 'ADD'",
      );
    });

    await u.step('invalid: numeric expression', () => {
      asserts.assertThrows(
        () => assertStringExpression({ type: 'MULTIPLY', args: [2, 3] } as any),
        TypeError,
        "Expected a String expression type, got 'MULTIPLY'",
      );
    });
  });

  await t.step('isStringExpression', async (u) => {
    await u.step('valid: string expressions', () => {
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

    await u.step('invalid: expressions', () => {
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
  });

  await t.step('Integration tests', async (u) => {
    await u.step('filter string expressions', () => {
      const expressions: unknown[] = [
        { type: 'UUID' },
        { type: 'ADD', args: [1, 2] },
        { type: 'CONCAT', args: ['a', 'b'] },
        { type: 'NOW' },
        { type: 'LOWER', args: 'test' },
        'invalid',
      ];

      const stringExpressions = expressions.filter((x) =>
        isStringExpression(x)
      );

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

    await u.step('validate with column list', () => {
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

    await u.step('complex string operations', () => {
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

    await u.step('type narrowing with isStringExpression', () => {
      const expr: unknown = { type: 'CONCAT', args: ['Hello', ' ', 'World'] };

      if (isStringExpression(expr)) {
        // TypeScript narrows to string expression
        asserts.assertEquals(expr.type, 'CONCAT');
      }
    });
  });
});

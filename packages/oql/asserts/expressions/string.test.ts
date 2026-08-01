import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
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
} from './string.ts';

describe('oql.asserts.Expressions.String', () => {
  describe('UUID expression', () => {
    it('valid: basic UUID', () => {
      assertUUIDExpression({ $$_expression: 'UUID' });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertUUIDExpression({ $$_expression: 'CONCAT' } as any),
        TypeError,
        "Expected 'UUID'",
      );
    });

    it('isUUIDExpression type guard', () => {
      asserts.assertEquals(isUUIDExpression({ $$_expression: 'UUID' }), true);
      asserts.assertEquals(
        isUUIDExpression({ $$_expression: 'CONCAT' }),
        false,
      );
    });
  });

  describe('CONCAT expression', () => {
    it('valid: literal strings', () => {
      assertConcatExpression({
        $$_expression: 'CONCAT',
        args: ['Hello', ' ', 'World'],
      });
    });

    it('valid: single string', () => {
      assertConcatExpression({ $$_expression: 'CONCAT', args: ['Hello'] });
    });

    it('valid: column references', () => {
      assertConcatExpression(
        { $$_expression: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
        ['first_name', 'last_name'],
      );
    });

    it('valid: mixed types', () => {
      assertConcatExpression(
        {
          $$_expression: 'CONCAT',
          args: ['User: ', '@username', ' (', '@email', ')'],
        },
        ['username', 'email'],
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertConcatExpression({ $$_expression: 'LOWER' } as any),
        TypeError,
        "Expected 'CONCAT'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertConcatExpression({ $$_expression: 'CONCAT' } as any),
        TypeError,
        "'args' must be a non-empty array for CONCAT",
      );
    });

    it('invalid: empty args array', () => {
      asserts.assertThrows(
        () =>
          assertConcatExpression({ $$_expression: 'CONCAT', args: [] } as any),
        TypeError,
        "'args' must be a non-empty array for CONCAT",
      );
    });

    it('invalid: non-string arg', () => {
      asserts.assertThrows(
        () =>
          assertConcatExpression(
            { $$_expression: 'CONCAT', args: [123] } as any,
          ),
        TypeError,
        'Invalid argument',
      );
    });

    it('valid: @-string not in list is treated as literal', () => {
      // CONCAT takes string args. An @-string not in the columnList is
      // not a column reference; it falls through and is accepted as a
      // string literal.
      assertConcatExpression(
        { $$_expression: 'CONCAT', args: ['@invalid'] },
        ['first_name', 'last_name'],
      );
    });

    it('invalid: number with column list', () => {
      asserts.assertThrows(
        () =>
          assertConcatExpression(
            { $$_expression: 'CONCAT', args: ['@col', 123] },
            ['col'],
          ),
        TypeError,
        'Invalid argument 123 in CONCAT expression',
      );
    });

    it('isConcatExpression type guard', () => {
      asserts.assertEquals(
        isConcatExpression({ $$_expression: 'CONCAT', args: ['a', 'b'] }),
        true,
      );
      asserts.assertEquals(
        isConcatExpression({ $$_expression: 'CONCAT', args: [] }),
        false,
      );
    });
  });

  describe('LOWER expression', () => {
    it('valid: literal string', () => {
      assertLowerExpression({ $$_expression: 'LOWER', args: 'HELLO' });
    });

    it('valid: column reference', () => {
      assertLowerExpression({ $$_expression: 'LOWER', args: '@email' }, [
        'email',
      ]);
    });

    it('valid: empty string', () => {
      assertLowerExpression({ $$_expression: 'LOWER', args: '' });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertLowerExpression({ $$_expression: 'UPPER' } as any),
        TypeError,
        "Expected 'LOWER'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertLowerExpression({ $$_expression: 'LOWER' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: numeric arg', () => {
      asserts.assertThrows(
        () =>
          assertLowerExpression({ $$_expression: 'LOWER', args: 123 } as any),
        TypeError,
        'Invalid',
      );
    });

    it('isLowerExpression type guard', () => {
      asserts.assertEquals(
        isLowerExpression({ $$_expression: 'LOWER', args: 'test' }),
        true,
      );
      asserts.assertEquals(
        isLowerExpression({ $$_expression: 'LOWER', args: 123 }),
        false,
      );
    });
  });

  describe('UPPER expression', () => {
    it('valid: literal string', () => {
      assertUpperExpression({ $$_expression: 'UPPER', args: 'hello' });
    });

    it('valid: column reference', () => {
      assertUpperExpression(
        { $$_expression: 'UPPER', args: '@country_code' },
        ['country_code'],
      );
    });

    it('valid: empty string', () => {
      assertUpperExpression({ $$_expression: 'UPPER', args: '' });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertUpperExpression({ $$_expression: 'LOWER' } as any),
        TypeError,
        "Expected 'UPPER'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertUpperExpression({ $$_expression: 'UPPER' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('isUpperExpression type guard', () => {
      asserts.assertEquals(
        isUpperExpression({ $$_expression: 'UPPER', args: 'test' }),
        true,
      );
      asserts.assertEquals(
        isUpperExpression({ $$_expression: 'UPPER' }),
        false,
      );
    });
  });

  describe('TRIM expression', () => {
    it('valid: literal string', () => {
      assertTrimExpression({ $$_expression: 'TRIM', args: '  hello  ' });
    });

    it('valid: column reference', () => {
      assertTrimExpression(
        { $$_expression: 'TRIM', args: '@user_input' },
        ['user_input'],
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertTrimExpression({ $$_expression: 'LTRIM' } as any),
        TypeError,
        "Expected 'TRIM'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertTrimExpression({ $$_expression: 'TRIM' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('isTrimExpression type guard', () => {
      asserts.assertEquals(
        isTrimExpression({ $$_expression: 'TRIM', args: '  test  ' }),
        true,
      );
      asserts.assertEquals(isTrimExpression({ $$_expression: 'TRIM' }), false);
    });
  });

  describe('LTRIM expression', () => {
    it('valid: literal string', () => {
      assertLTrimExpression({ $$_expression: 'LTRIM', args: '  hello  ' });
    });

    it('valid: column reference', () => {
      assertLTrimExpression(
        { $$_expression: 'LTRIM', args: '@description' },
        ['description'],
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertLTrimExpression({ $$_expression: 'RTRIM' } as any),
        TypeError,
        "Expected 'LTRIM'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertLTrimExpression({ $$_expression: 'LTRIM' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('isLTrimExpression type guard', () => {
      asserts.assertEquals(
        isLTrimExpression({ $$_expression: 'LTRIM', args: '  test' }),
        true,
      );
      asserts.assertEquals(
        isLTrimExpression({ $$_expression: 'LTRIM' }),
        false,
      );
    });
  });

  describe('RTRIM expression', () => {
    it('valid: literal string', () => {
      assertRTrimExpression({ $$_expression: 'RTRIM', args: '  hello  ' });
    });

    it('valid: column reference', () => {
      assertRTrimExpression({ $$_expression: 'RTRIM', args: '@notes' }, [
        'notes',
      ]);
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertRTrimExpression({ $$_expression: 'LTRIM' } as any),
        TypeError,
        "Expected 'RTRIM'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertRTrimExpression({ $$_expression: 'RTRIM' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('isRTrimExpression type guard', () => {
      asserts.assertEquals(
        isRTrimExpression({ $$_expression: 'RTRIM', args: 'test  ' }),
        true,
      );
      asserts.assertEquals(
        isRTrimExpression({ $$_expression: 'RTRIM' }),
        false,
      );
    });
  });

  describe('SUBSTR expression', () => {
    it('valid: all properties', () => {
      assertSubstrExpression({
        $$_expression: 'SUBSTR',
        args: { string: 'Hello World', start: 0, length: 5 },
      });
    });

    it('valid: without length', () => {
      assertSubstrExpression({
        $$_expression: 'SUBSTR',
        args: { string: 'Hello World', start: 6 },
      });
    });

    it('valid: column references', () => {
      assertSubstrExpression(
        {
          $$_expression: 'SUBSTR',
          args: { string: '@description', start: 0, length: 100 },
        },
        ['description'],
      );
    });

    it('valid: column start', () => {
      assertSubstrExpression(
        {
          $$_expression: 'SUBSTR',
          args: { string: '@text', start: '@position', length: 50 },
        },
        ['text', 'position'],
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertSubstrExpression({ $$_expression: 'REPLACE' } as any),
        TypeError,
        "Expected 'SUBSTR'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertSubstrExpression({ $$_expression: 'SUBSTR' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: args not object', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression(
            { $$_expression: 'SUBSTR', args: 'invalid' } as any,
          ),
        TypeError,
        "'args' must be an object for SUBSTR",
      );
    });

    it('invalid: missing string', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            $$_expression: 'SUBSTR',
            args: { start: 0, length: 5 },
          } as any),
        TypeError,
        "Missing 'string' property",
      );
    });

    it('invalid: missing start', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            $$_expression: 'SUBSTR',
            args: { string: 'test', length: 5 },
          } as any),
        TypeError,
        "Missing 'start' property",
      );
    });

    it('invalid: string not string', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            $$_expression: 'SUBSTR',
            args: { string: 123, start: 0 },
          } as any),
        TypeError,
        'string must be a string or column identifier',
      );
    });

    it('invalid: start not number', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            $$_expression: 'SUBSTR',
            args: { string: 'test', start: 'zero' },
          } as any),
        TypeError,
        'start must be a number or column identifier',
      );
    });

    it('valid: @-string not in list is treated as literal (string arg)', () => {
      assertSubstrExpression({
        $$_expression: 'SUBSTR',
        args: { string: '@invalid', start: 0 },
      }, ['valid']);
    });

    it('invalid: @-string not in list rejected in number arg', () => {
      // For number args (SUBSTR start), @-string not in columnList falls
      // through and is rejected as a string literal — wrong type.
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            $$_expression: 'SUBSTR',
            args: { string: 'test', start: '@invalid' },
          }, ['valid']),
        TypeError,
        'got string literal',
      );
    });

    it('invalid: start is boolean', () => {
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            $$_expression: 'SUBSTR',
            args: { string: 'test', start: true },
          } as any),
        TypeError,
        'start must be a number or column identifier',
      );
    });

    it('isSubstrExpression type guard', () => {
      asserts.assertEquals(
        isSubstrExpression({
          $$_expression: 'SUBSTR',
          args: { string: 'test', start: 0 },
        }),
        true,
      );
      asserts.assertEquals(
        isSubstrExpression({
          $$_expression: 'SUBSTR',
          args: { string: 'test' },
        }),
        false,
      );
    });
  });

  describe('REPLACE expression', () => {
    it('valid: literal strings', () => {
      assertReplaceExpression({
        $$_expression: 'REPLACE',
        args: { string: 'Hello World', search: 'World', replace: 'There' },
      });
    });

    it('valid: column references', () => {
      assertReplaceExpression(
        {
          $$_expression: 'REPLACE',
          args: { string: '@description', search: 'old', replace: 'new' },
        },
        ['description'],
      );
    });

    it('valid: empty replace', () => {
      assertReplaceExpression({
        $$_expression: 'REPLACE',
        args: { string: '@phone', search: '-', replace: '' },
      });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertReplaceExpression({ $$_expression: 'SUBSTR' } as any),
        TypeError,
        "Expected 'REPLACE'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertReplaceExpression({ $$_expression: 'REPLACE' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: missing string', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            $$_expression: 'REPLACE',
            args: { search: 'old', replace: 'new' },
          } as any),
        TypeError,
        "Missing 'string' property",
      );
    });

    it('invalid: missing search', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            $$_expression: 'REPLACE',
            args: { string: 'test', replace: 'new' },
          } as any),
        TypeError,
        "Missing 'search' property",
      );
    });

    it('invalid: missing replace', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            $$_expression: 'REPLACE',
            args: { string: 'test', search: 'old' },
          } as any),
        TypeError,
        "Missing 'replace' property",
      );
    });

    it('invalid: args is null', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            $$_expression: 'REPLACE',
            args: null,
          } as any),
        TypeError,
        "'args' must be an object",
      );
    });

    it('invalid: string not string', () => {
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            $$_expression: 'REPLACE',
            args: { string: 123, search: 'old', replace: 'new' },
          } as any),
        TypeError,
        'string must be a string or column identifier',
      );
    });

    it('valid: @-strings not in list are treated as literals', () => {
      // All three positions are string args; @-strings not in
      // columnList become literals.
      assertReplaceExpression({
        $$_expression: 'REPLACE',
        args: { string: '@invalid', search: 'old', replace: 'new' },
      }, ['valid']);
      assertReplaceExpression({
        $$_expression: 'REPLACE',
        args: { string: 'test', search: '@invalid', replace: 'new' },
      }, ['valid']);
      assertReplaceExpression({
        $$_expression: 'REPLACE',
        args: { string: 'test', search: 'old', replace: '@invalid' },
      }, ['valid']);
    });

    it('isReplaceExpression type guard', () => {
      asserts.assertEquals(
        isReplaceExpression({
          $$_expression: 'REPLACE',
          args: { string: 'test', search: 'e', replace: 'a' },
        }),
        true,
      );
      asserts.assertEquals(
        isReplaceExpression({
          $$_expression: 'REPLACE',
          args: { string: 'test', search: 'e' },
        }),
        false,
      );
    });
  });

  describe('LPAD expression', () => {
    it('valid: spaces (no fill)', () => {
      assertLPadExpression({
        $$_expression: 'LPAD',
        args: { string: '42', length: 5 },
      });
    });

    it('valid: custom fill', () => {
      assertLPadExpression({
        $$_expression: 'LPAD',
        args: { string: '42', length: 5, fill: '0' },
      });
    });

    it('valid: column references', () => {
      assertLPadExpression(
        {
          $$_expression: 'LPAD',
          args: { string: '@order_number', length: 10, fill: '0' },
        },
        ['order_number'],
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertLPadExpression({ $$_expression: 'RPAD' } as any),
        TypeError,
        "Expected 'LPAD'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertLPadExpression({ $$_expression: 'LPAD' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: args is null', () => {
      asserts.assertThrows(
        () =>
          assertLPadExpression({ $$_expression: 'LPAD', args: null } as any),
        TypeError,
        "'args' must be an object",
      );
    });

    it('invalid: missing string', () => {
      asserts.assertThrows(
        () =>
          assertLPadExpression({
            $$_expression: 'LPAD',
            args: { length: 5 },
          } as any),
        TypeError,
        "Missing 'string' property",
      );
    });

    it('invalid: missing length', () => {
      asserts.assertThrows(
        () =>
          assertLPadExpression({
            $$_expression: 'LPAD',
            args: { string: '42' },
          } as any),
        TypeError,
        "Missing 'length' property",
      );
    });

    it('invalid: length not number', () => {
      asserts.assertThrows(
        () =>
          assertLPadExpression({
            $$_expression: 'LPAD',
            args: { string: '42', length: 'five' },
          } as any),
        TypeError,
        'length must be a number or column identifier',
      );
    });

    it('invalid: string not string', () => {
      asserts.assertThrows(
        () =>
          assertLPadExpression({
            $$_expression: 'LPAD',
            args: { string: 789, length: 5 },
          } as any),
        TypeError,
        'string must be a string or column identifier',
      );
    });

    it('valid: @-string not in list is literal in string args', () => {
      // string and fill are string args; @-string not in list = literal.
      assertLPadExpression({
        $$_expression: 'LPAD',
        args: { string: '@invalid', length: 5 },
      }, ['valid']);
      assertLPadExpression({
        $$_expression: 'LPAD',
        args: { string: 'test', length: 5, fill: '@invalid' },
      }, ['valid']);
    });

    it('invalid: @-string not in list rejected in number arg', () => {
      // length is a number arg; @-string not in list falls through and
      // is rejected as a string literal.
      asserts.assertThrows(
        () =>
          assertLPadExpression({
            $$_expression: 'LPAD',
            args: { string: 'test', length: '@invalid' },
          }, ['valid']),
        TypeError,
        'got string literal',
      );
    });

    it('isLPadExpression type guard', () => {
      asserts.assertEquals(
        isLPadExpression({
          $$_expression: 'LPAD',
          args: { string: '42', length: 5 },
        }),
        true,
      );
      asserts.assertEquals(
        isLPadExpression({
          $$_expression: 'LPAD',
          args: { string: '42' },
        }),
        false,
      );
    });
  });

  describe('RPAD expression', () => {
    it('valid: spaces (no fill)', () => {
      assertRPadExpression({
        $$_expression: 'RPAD',
        args: { string: '42', length: 5 },
      });
    });

    it('valid: custom fill', () => {
      assertRPadExpression({
        $$_expression: 'RPAD',
        args: { string: 'LOG', length: 10, fill: '.' },
      });
    });

    it('valid: column references', () => {
      assertRPadExpression(
        {
          $$_expression: 'RPAD',
          args: { string: '@status', length: 15, fill: ' ' },
        },
        ['status'],
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertRPadExpression({ $$_expression: 'LPAD' } as any),
        TypeError,
        "Expected 'RPAD'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertRPadExpression({ $$_expression: 'RPAD' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: args is null', () => {
      asserts.assertThrows(
        () =>
          assertRPadExpression({ $$_expression: 'RPAD', args: null } as any),
        TypeError,
        "'args' must be an object",
      );
    });

    it('invalid: missing string', () => {
      asserts.assertThrows(
        () =>
          assertRPadExpression({
            $$_expression: 'RPAD',
            args: { length: 5 },
          } as any),
        TypeError,
        "Missing 'string' property",
      );
    });

    it('invalid: missing length', () => {
      asserts.assertThrows(
        () =>
          assertRPadExpression({
            $$_expression: 'RPAD',
            args: { string: '42' },
          } as any),
        TypeError,
        "Missing 'length' property",
      );
    });

    it('invalid: string not string', () => {
      asserts.assertThrows(
        () =>
          assertRPadExpression({
            $$_expression: 'RPAD',
            args: { string: 456, length: 5 },
          } as any),
        TypeError,
        'string must be a string or column identifier',
      );
    });

    it('invalid: length not number', () => {
      asserts.assertThrows(
        () =>
          assertRPadExpression({
            $$_expression: 'RPAD',
            args: { string: 'test', length: 'ten' },
          } as any),
        TypeError,
        'length must be a number or column identifier',
      );
    });

    it('valid: @-string not in list is literal in string args', () => {
      assertRPadExpression({
        $$_expression: 'RPAD',
        args: { string: '@invalid', length: 5 },
      }, ['valid']);
      assertRPadExpression({
        $$_expression: 'RPAD',
        args: { string: 'test', length: 5, fill: '@invalid' },
      }, ['valid']);
    });

    it('invalid: @-string not in list rejected in number arg', () => {
      asserts.assertThrows(
        () =>
          assertRPadExpression({
            $$_expression: 'RPAD',
            args: { string: 'test', length: '@invalid' },
          }, ['valid']),
        TypeError,
        'got string literal',
      );
    });

    it('isRPadExpression type guard', () => {
      asserts.assertEquals(
        isRPadExpression({
          $$_expression: 'RPAD',
          args: { string: '42', length: 5 },
        }),
        true,
      );
      asserts.assertEquals(
        isRPadExpression({
          $$_expression: 'RPAD',
          args: { string: '42' },
        }),
        false,
      );
    });
  });

  describe('ENCRYPT expression', () => {
    it('valid: literals', () => {
      assertEncryptExpression({
        $$_expression: 'ENCRYPT',
        args: { secret: 'my-key', data: 'sensitive' },
      });
    });

    it('valid: column references', () => {
      assertEncryptExpression(
        {
          $$_expression: 'ENCRYPT',
          args: { secret: 'key', data: '@ssn' },
        },
        ['ssn'],
      );
    });

    it('valid: numeric data', () => {
      assertEncryptExpression({
        $$_expression: 'ENCRYPT',
        args: { secret: 'key', data: 123 },
      });
    });

    it('valid: Date data', () => {
      assertEncryptExpression({
        $$_expression: 'ENCRYPT',
        args: { secret: 'key', data: new Date() },
      });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertEncryptExpression({ $$_expression: 'DECRYPT' } as any),
        TypeError,
        "Expected 'ENCRYPT'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertEncryptExpression({ $$_expression: 'ENCRYPT' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: args is null', () => {
      asserts.assertThrows(
        () =>
          assertEncryptExpression(
            { $$_expression: 'ENCRYPT', args: null } as any,
          ),
        TypeError,
        "'args' must be an object",
      );
    });

    it('invalid: missing secret', () => {
      asserts.assertThrows(
        () =>
          assertEncryptExpression({
            $$_expression: 'ENCRYPT',
            args: { data: 'test' },
          } as any),
        TypeError,
        "Missing 'secret' property",
      );
    });

    it('invalid: missing data', () => {
      asserts.assertThrows(
        () =>
          assertEncryptExpression({
            $$_expression: 'ENCRYPT',
            args: { secret: 'key' },
          } as any),
        TypeError,
        "Missing 'data' property",
      );
    });

    it('invalid: secret not string', () => {
      asserts.assertThrows(
        () =>
          assertEncryptExpression({
            $$_expression: 'ENCRYPT',
            args: { secret: 123, data: 'test' },
          } as any),
        TypeError,
        'secret must be a string or column identifier',
      );
    });

    it('valid: @-strings not in list are literals in secret/data', () => {
      // Both secret and data accept either column ref or literal;
      // @-strings not in columnList become literals.
      assertEncryptExpression({
        $$_expression: 'ENCRYPT',
        args: { secret: '@invalid', data: 'test' },
      }, ['valid']);
      assertEncryptExpression({
        $$_expression: 'ENCRYPT',
        args: { secret: 'key', data: '@invalid' },
      }, ['valid']);
    });

    it('isEncryptExpression type guard', () => {
      asserts.assertEquals(
        isEncryptExpression({
          $$_expression: 'ENCRYPT',
          args: { secret: 'key', data: 'test' },
        }),
        true,
      );
      asserts.assertEquals(
        isEncryptExpression({
          $$_expression: 'ENCRYPT',
          args: { secret: 'key' },
        }),
        false,
      );
    });
  });

  describe('DECRYPT expression', () => {
    it('valid: literals', () => {
      assertDecryptExpression({
        $$_expression: 'DECRYPT',
        args: { secret: 'my-key', data: 'encrypted-data' },
      });
    });

    it('valid: column references', () => {
      assertDecryptExpression(
        {
          $$_expression: 'DECRYPT',
          args: { secret: 'key', data: '@encrypted_ssn' },
        },
        ['encrypted_ssn'],
      );
    });

    it('valid: column secret', () => {
      assertDecryptExpression(
        {
          $$_expression: 'DECRYPT',
          args: { secret: '@user_key', data: '@encrypted_data' },
        },
        ['user_key', 'encrypted_data'],
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertDecryptExpression({ $$_expression: 'ENCRYPT' } as any),
        TypeError,
        "Expected 'DECRYPT'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertDecryptExpression({ $$_expression: 'DECRYPT' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: args is null', () => {
      asserts.assertThrows(
        () =>
          assertDecryptExpression(
            { $$_expression: 'DECRYPT', args: null } as any,
          ),
        TypeError,
        "'args' must be an object",
      );
    });

    it('invalid: missing secret', () => {
      asserts.assertThrows(
        () =>
          assertDecryptExpression({
            $$_expression: 'DECRYPT',
            args: { data: 'test' },
          } as any),
        TypeError,
        "Missing 'secret' property",
      );
    });

    it('invalid: missing data', () => {
      asserts.assertThrows(
        () =>
          assertDecryptExpression({
            $$_expression: 'DECRYPT',
            args: { secret: 'key' },
          } as any),
        TypeError,
        "Missing 'data' property",
      );
    });

    it('invalid: secret not string', () => {
      asserts.assertThrows(
        () =>
          assertDecryptExpression({
            $$_expression: 'DECRYPT',
            args: { secret: 456, data: 'test' },
          } as any),
        TypeError,
        'secret must be a string or column identifier',
      );
    });

    it('valid: @-strings not in list are literals in secret/data', () => {
      assertDecryptExpression({
        $$_expression: 'DECRYPT',
        args: { secret: '@invalid', data: 'test' },
      }, ['valid']);
      assertDecryptExpression({
        $$_expression: 'DECRYPT',
        args: { secret: 'key', data: '@invalid' },
      }, ['valid']);
    });

    it('isDecryptExpression type guard', () => {
      asserts.assertEquals(
        isDecryptExpression({
          $$_expression: 'DECRYPT',
          args: { secret: 'key', data: 'test' },
        }),
        true,
      );
      asserts.assertEquals(
        isDecryptExpression({
          $$_expression: 'DECRYPT',
          args: { secret: 'key' },
        }),
        false,
      );
    });
  });

  describe('HASH expression', () => {
    it('valid: string literal', () => {
      assertHashExpression({ $$_expression: 'HASH', args: 'sensitive-data' });
    });

    it('valid: column reference', () => {
      assertHashExpression({ $$_expression: 'HASH', args: '@password' }, [
        'password',
      ]);
    });

    it('valid: number', () => {
      assertHashExpression({ $$_expression: 'HASH', args: 123 });
    });

    it('valid: bigint', () => {
      assertHashExpression({ $$_expression: 'HASH', args: 123n });
    });

    it('valid: boolean', () => {
      assertHashExpression({ $$_expression: 'HASH', args: true });
    });

    it('valid: Date', () => {
      assertHashExpression({ $$_expression: 'HASH', args: new Date() });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertHashExpression({ $$_expression: 'ENCRYPT' } as any),
        TypeError,
        "Expected 'HASH'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertHashExpression({ $$_expression: 'HASH' } as any),
        TypeError,
        "Missing 'args' property",
      );
    });

    it('invalid: object arg', () => {
      asserts.assertThrows(
        () =>
          assertHashExpression(
            { $$_expression: 'HASH', args: { foo: 'bar' } } as any,
          ),
        TypeError,
        'args must be a string, number, bigint, Date, boolean, or column identifier',
      );
    });

    it('valid: @-string not in list is treated as literal', () => {
      // HASH accepts any literal (including string); @-string not in
      // columnList becomes a literal string.
      assertHashExpression(
        { $$_expression: 'HASH', args: '@invalid' },
        ['password', 'email'],
      );
    });

    it('isHashExpression type guard', () => {
      asserts.assertEquals(
        isHashExpression({ $$_expression: 'HASH', args: 'test' }),
        true,
      );
      asserts.assertEquals(
        isHashExpression({ $$_expression: 'HASH', args: {} }),
        false,
      );
    });
  });

  describe('assertStringExpression', () => {
    it('delegates to UUID', () => {
      assertStringExpression({ $$_expression: 'UUID' });
    });

    it('delegates to CONCAT', () => {
      assertStringExpression({ $$_expression: 'CONCAT', args: ['a', 'b'] });
    });

    it('delegates to LOWER', () => {
      assertStringExpression({ $$_expression: 'LOWER', args: 'test' });
    });

    it('delegates to UPPER', () => {
      assertStringExpression({ $$_expression: 'UPPER', args: 'test' });
    });

    it('delegates to TRIM', () => {
      assertStringExpression({ $$_expression: 'TRIM', args: '  test  ' });
    });

    it('delegates to LTRIM', () => {
      assertStringExpression({ $$_expression: 'LTRIM', args: '  test' });
    });

    it('delegates to RTRIM', () => {
      assertStringExpression({ $$_expression: 'RTRIM', args: 'test  ' });
    });

    it('delegates to SUBSTR', () => {
      assertStringExpression({
        $$_expression: 'SUBSTR',
        args: { string: 'test', start: 0 },
      });
    });

    it('delegates to REPLACE', () => {
      assertStringExpression({
        $$_expression: 'REPLACE',
        args: { string: 'test', search: 'e', replace: 'a' },
      });
    });

    it('delegates to LPAD', () => {
      assertStringExpression({
        $$_expression: 'LPAD',
        args: { string: '42', length: 5 },
      });
    });

    it('delegates to RPAD', () => {
      assertStringExpression({
        $$_expression: 'RPAD',
        args: { string: '42', length: 5 },
      });
    });

    it('delegates to ENCRYPT', () => {
      assertStringExpression({
        $$_expression: 'ENCRYPT',
        args: { secret: 'key', data: 'test' },
      });
    });

    it('delegates to DECRYPT', () => {
      assertStringExpression({
        $$_expression: 'DECRYPT',
        args: { secret: 'key', data: 'test' },
      });
    });

    it('delegates to HASH', () => {
      assertStringExpression({ $$_expression: 'HASH', args: 'test' });
    });

    it('invalid: non-string type', () => {
      asserts.assertThrows(
        () => assertStringExpression({ $$_expression: 'ADD' } as any),
        TypeError,
        "Expected a String expression type, got 'ADD'",
      );
    });

    it('invalid: numeric expression', () => {
      asserts.assertThrows(
        () =>
          assertStringExpression(
            { $$_expression: 'MULTIPLY', args: [2, 3] } as any,
          ),
        TypeError,
        "Expected a String expression type, got 'MULTIPLY'",
      );
    });
  });

  describe('isStringExpression', () => {
    it('valid: string expressions', () => {
      asserts.assertEquals(isStringExpression({ $$_expression: 'UUID' }), true);
      asserts.assertEquals(
        isStringExpression({ $$_expression: 'CONCAT', args: ['a', 'b'] }),
        true,
      );
      asserts.assertEquals(
        isStringExpression({ $$_expression: 'LOWER', args: 'test' }),
        true,
      );
      asserts.assertEquals(
        isStringExpression({ $$_expression: 'UPPER', args: 'test' }),
        true,
      );
      asserts.assertEquals(
        isStringExpression({
          $$_expression: 'SUBSTR',
          args: { string: 'test', start: 0 },
        }),
        true,
      );
      asserts.assertEquals(
        isStringExpression({ $$_expression: 'HASH', args: 'test' }),
        true,
      );
    });

    it('invalid: expressions', () => {
      asserts.assertEquals(
        isStringExpression({ $$_expression: 'ADD', args: [1, 2] }),
        false,
      );
      asserts.assertEquals(
        isStringExpression({ $$_expression: 'NOW' }),
        false,
      );
      asserts.assertEquals(
        isStringExpression({ $$_expression: 'INVALID' }),
        false,
      );
    });
  });

  describe('Integration tests', () => {
    it('filter string expressions', () => {
      const expressions: unknown[] = [
        { $$_expression: 'UUID' },
        { $$_expression: 'ADD', args: [1, 2] },
        { $$_expression: 'CONCAT', args: ['a', 'b'] },
        { $$_expression: 'NOW' },
        { $$_expression: 'LOWER', args: 'test' },
        'invalid',
      ];

      const stringExpressions = expressions.filter((x) =>
        isStringExpression(x)
      );

      asserts.assertEquals(stringExpressions.length, 3);
      asserts.assertEquals(stringExpressions[0], { $$_expression: 'UUID' });
      asserts.assertEquals(stringExpressions[1], {
        $$_expression: 'CONCAT',
        args: ['a', 'b'],
      });
      asserts.assertEquals(stringExpressions[2], {
        $$_expression: 'LOWER',
        args: 'test',
      });
    });

    it('validate with column list', () => {
      const columns = ['first_name', 'last_name', 'email', 'username'];

      // Valid column usage
      assertStringExpression(
        { $$_expression: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
        columns,
      );

      assertStringExpression(
        { $$_expression: 'LOWER', args: '@email' },
        columns,
      );

      // @-string not in column list is treated as a literal string
      assertStringExpression(
        { $$_expression: 'UPPER', args: '@invalid' },
        columns,
      );
    });

    it('complex string operations', () => {
      const columns = ['description', 'template', 'user_name'];

      // SUBSTR with columns
      assertStringExpression(
        {
          $$_expression: 'SUBSTR',
          args: { string: '@description', start: 0, length: 100 },
        },
        columns,
      );

      // REPLACE with dynamic replacement
      assertStringExpression(
        {
          $$_expression: 'REPLACE',
          args: {
            string: '@template',
            search: '{{name}}',
            replace: '@user_name',
          },
        },
        columns,
      );
    });

    it('type narrowing with isStringExpression', () => {
      const expr: unknown = {
        $$_expression: 'CONCAT',
        args: ['Hello', ' ', 'World'],
      };

      if (isStringExpression(expr)) {
        // TypeScript narrows to string expression
        asserts.assertEquals(expr.$$_expression, 'CONCAT');
      }
    });
  });
});

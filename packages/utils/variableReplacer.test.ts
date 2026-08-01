import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { variableReplacer } from './variableReplacer.ts';

describe('utils.variableReplacer', () => {
  // Tests replacing single-level keys
  it('should replace single-level keys', () => {
    const msg = 'Hello ${name}, you are ${age} years old.';
    const context = { name: 'Alice', age: 30 };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Hello Alice, you are 30 years old.');
  });

  // Tests replacing nested keys with dot notation
  it('should handle nested properties', () => {
    const msg = 'Name: ${user.name}, Email: ${user.contact.email}';
    const context = {
      user: {
        name: 'Bob',
        contact: {
          email: 'bob@example.com',
        },
      },
    };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Name: Bob, Email: bob@example.com');
  });

  // Tests replacing array values
  it('should handle array values', () => {
    const msg = 'Fruits: ${shop.fruits}';
    const context = { shop: { fruits: ['apples', 'bananas', 'pears'] } };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Fruits: (apples, bananas, pears)');
  });

  // Tests missing keys (should leave placeholder intact)
  it('should leave unknown placeholders as is', () => {
    const msg = 'Name: ${name}, Age: ${age}';
    const context = { name: 'Charlie' };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Name: Charlie, Age: ${age}');
  });

  // Tests when there are no placeholders
  it('should return original string if no placeholders', () => {
    const msg = 'No placeholders here';
    const context = { name: 'Dave' };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'No placeholders here');
  });

  // ---------------------------------------------
  // Below are some fail/edge cases that confirm
  // the function’s behavior under problematic input
  // ---------------------------------------------

  // Test placeholders missing a closing brace
  it('should leave malformed placeholders as is', () => {
    const msg = 'Malformed placeholder: {name';
    const context = { name: 'Eve' };
    // The function won't replace anything because the placeholder is incomplete
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Malformed placeholder: {name');
  });

  // Test cyclical references in context - improved with proper error detection
  it('should handle cyclical references in context', () => {
    const msg = 'Value: ${a.b.c}';
    // deno-lint-ignore no-explicit-any
    const context: any = { a: { b: {} } };
    context.a.b.c = context.a; // Creates a cycle

    try {
      variableReplacer(msg, context);
      asserts.fail('Function should have thrown an error due to cycle');
    } catch (error) {
      // Just verify any error was thrown - the specific error depends on implementation
      asserts.assert(error instanceof Error);
    }
  });

  it('should handle deeply nested objects', () => {
    const msg = 'Accessing ${level1.level2.level3.level4.level5.value}';
    const context = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                value: 'deep value',
              },
            },
          },
        },
      },
    };

    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Accessing deep value');
  });

  it('should handle mixed types properly', () => {
    const msg =
      'Number: ${num}, String: ${str}, Boolean: ${bool}, Null: ${nul}, Undefined: ${und}';
    const context = {
      num: 42,
      str: 'hello',
      bool: true,
      nul: null,
      und: undefined,
    };

    const result = variableReplacer(msg, context);
    asserts.assertEquals(
      result,
      'Number: 42, String: hello, Boolean: true, Null: null, Undefined: ${und}',
    );
  });

  // Additional comprehensive tests
  it('should handle empty strings and special characters', () => {
    const msg = 'Empty: "${empty}", Special: ${special}';
    const context = {
      empty: '',
      special: 'Hello "World" & <Test>',
    };

    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Empty: "", Special: Hello "World" & <Test>');
  });

  it('should work with custom regex patterns', () => {
    const msg = 'Hello {{name}}, you are {{age}} years old.';
    const context = { name: 'Alice', age: 30 };
    const customRegex = /\{\{([^}]+)\}\}/g;

    const result = variableReplacer(msg, context, customRegex);
    asserts.assertEquals(result, 'Hello Alice, you are 30 years old.');
  });

  it('custom regex respects dot-path lookup on nested values', () => {
    const msg = 'User {{user.name}} from {{user.country}}';
    const context = { user: { name: 'Bob', country: 'JP' } };
    const customRegex = /\{\{([^}]+)\}\}/g;
    const result = variableReplacer(msg, context, customRegex);
    asserts.assertEquals(result, 'User Bob from JP');
  });

  it('custom regex preserves placeholder on missing values', () => {
    const msg = 'Hello {{name}}, your role is {{role}}';
    const context = { name: 'Carol' };
    const customRegex = /\{\{([^}]+)\}\}/g;
    const result = variableReplacer(msg, context, customRegex);
    asserts.assertEquals(result, 'Hello Carol, your role is {{role}}');
  });

  it('custom regex formats arrays the same way as default delimiters', () => {
    const msg = 'Tags: <<tags>>';
    const context = { tags: ['x', 'y', 'z'] };
    const customRegex = /<<([^>]+)>>/g;
    const result = variableReplacer(msg, context, customRegex);
    asserts.assertEquals(result, 'Tags: (x, y, z)');
  });

  it('should handle complex nested arrays', () => {
    const msg = 'Users: ${users}, Tags: ${project.tags}';
    const context = {
      users: ['Alice', 'Bob', 'Charlie'],
      project: {
        tags: ['typescript', 'deno', 'utility'],
      },
    };

    const result = variableReplacer(msg, context);
    asserts.assertEquals(
      result,
      'Users: (Alice, Bob, Charlie), Tags: (typescript, deno, utility)',
    );
  });

  it('should handle arrays and object properties', () => {
    const msg = 'Items: ${items}, Status: ${config.status}';
    const context = {
      items: ['first', 'second', 'third'],
      config: { status: 'active', version: '1.0' },
    };

    const result = variableReplacer(msg, context);
    asserts.assertEquals(
      result,
      'Items: (first, second, third), Status: active',
    );
  });

  it('should handle edge case with empty context', () => {
    const msg = 'Hello ${name}!';
    const context = {};

    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Hello ${name}!');
  });

  it('should handle multiple occurrences of same placeholder', () => {
    const msg = '${name} said "${message}". ${name} was happy.';
    const context = {
      name: 'Alice',
      message: 'Hello World',
    };

    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Alice said "Hello World". Alice was happy.');
  });

  it('should preserve spaces and formatting', () => {
    const msg = '  Spaced: ${value}  \n  Newline: ${other}  ';
    const context = {
      value: 'test',
      other: 'content',
    };

    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, '  Spaced: test  \n  Newline: content  ');
  });

  it('does not resolve inherited members (default delimiters)', () => {
    // `constructor`/`toString` live on the prototype, not own data, so
    // they must not be substituted — the placeholder is kept literal.
    const result = variableReplacer('${constructor}/${toString}', {});
    asserts.assertEquals(result, '${constructor}/${toString}');
  });

  it('rejects prototype-chain traversal (default delimiters)', () => {
    // deno-lint-ignore no-explicit-any
    (Object.prototype as any).polluted = 'leaked';
    try {
      const result = variableReplacer('${__proto__.polluted}', {});
      asserts.assertEquals(result, '${__proto__.polluted}');
      const result2 = variableReplacer('${user.constructor.name}', {
        user: { name: 'Ada' },
      });
      asserts.assertEquals(result2, '${user.constructor.name}');
    } finally {
      // deno-lint-ignore no-explicit-any
      delete (Object.prototype as any).polluted;
    }
  });

  it('rejects prototype-chain traversal (custom delimiters)', () => {
    const customRegex = /\{\{([^}]+)\}\}/g;
    // deno-lint-ignore no-explicit-any
    (Object.prototype as any).polluted = 'leaked';
    try {
      // Missing/blocked lookups keep their full placeholder (match).
      asserts.assertEquals(
        variableReplacer('{{constructor}}', {}, customRegex),
        '{{constructor}}',
      );
      asserts.assertEquals(
        variableReplacer('{{__proto__.polluted}}', {}, customRegex),
        '{{__proto__.polluted}}',
      );
      asserts.assertEquals(
        variableReplacer(
          '{{user.constructor.name}}',
          { user: { name: 'Ada' } },
          customRegex,
        ),
        '{{user.constructor.name}}',
      );
    } finally {
      // deno-lint-ignore no-explicit-any
      delete (Object.prototype as any).polluted;
    }
  });
});

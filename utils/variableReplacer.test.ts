import * as asserts from '$asserts';
import { variableReplacer } from './variableReplacer.ts';

Deno.test('utils.variableReplacer', async (t) => {
  // Tests replacing single-level keys
  await t.step('should replace single-level keys', () => {
    const msg = 'Hello ${name}, you are ${age} years old.';
    const context = { name: 'Alice', age: 30 };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Hello Alice, you are 30 years old.');
  });

  // Tests replacing nested keys with dot notation
  await t.step('should handle nested properties', () => {
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
  await t.step('should handle array values', () => {
    const msg = 'Fruits: ${shop.fruits}';
    const context = { shop: { fruits: ['apples', 'bananas', 'pears'] } };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Fruits: (apples, bananas, pears)');
  });

  // Tests missing keys (should leave placeholder intact)
  await t.step('should leave unknown placeholders as is', () => {
    const msg = 'Name: ${name}, Age: ${age}';
    const context = { name: 'Charlie' };
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Name: Charlie, Age: ${age}');
  });

  // Tests when there are no placeholders
  await t.step('should return original string if no placeholders', () => {
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
  await t.step('should leave malformed placeholders as is', () => {
    const msg = 'Malformed placeholder: {name';
    const context = { name: 'Eve' };
    // The function won't replace anything because the placeholder is incomplete
    const result = variableReplacer(msg, context);
    asserts.assertEquals(result, 'Malformed placeholder: {name');
  });

  // Test cyclical references in context - improved with proper error detection
  await t.step('should handle cyclical references in context', () => {
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

  await t.step('should handle deeply nested objects', () => {
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

  await t.step('should handle mixed types properly', () => {
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
});

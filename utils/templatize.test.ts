import * as asserts from '$asserts';

import { templatize } from './templatize.ts';

Deno.test('utils.templatize', async (t) => {
  await t.step('should replace placeholders with values', () => {
    const template = 'Hello, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(result({ name: 'sdf' }), 'Hello, sdf!');
  });

  await t.step('parse multiple placeholders', () => {
    const template =
      'Hello, ${name}! Today is ${day}. It would be nice to see you, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(
      result({ name: 'Alice', day: 'Monday' }),
      'Hello, Alice! Today is Monday. It would be nice to see you, Alice!',
    );
  });

  await t.step(
    'should ignore any parameters passed if no placeholders are present',
    () => {
      const template = 'Hello, world!';
      const result = templatize(template);
      asserts.assertEquals(result({ name: 'sdf' }), 'Hello, world!');
    },
  );

  await t.step('should replace missing values with an empty string', () => {
    const template = 'Hello, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(result(JSON.parse(JSON.stringify({}))), 'Hello, !');
  });

  await t.step('should handle adjacent placeholders', () => {
    const template = 'Value: ${prefix}${suffix}';
    const result = templatize(template);
    asserts.assertEquals(
      result({ prefix: 'pre', suffix: 'fix' }),
      'Value: prefix',
    );
  });

  await t.step('should handle special characters in placeholder names', () => {
    const template = 'Special: ${special-name} and ${special_name}';
    const result = templatize(template);
    asserts.assertEquals(
      result({ 'special-name': 'hyphen', 'special_name': 'underscore' }),
      'Special: hyphen and underscore',
    );
  });

  await t.step('should handle placeholders at the beginning and end', () => {
    const template = '${start}Middle${end}';
    const result = templatize(template);
    asserts.assertEquals(
      result({ start: 'Beginning-', end: '-End' }),
      'Beginning-Middle-End',
    );
  });

  await t.step('should correctly handle empty string values', () => {
    const template = 'Hello, ${name}!';
    const result = templatize(template);
    asserts.assertEquals(result({ name: '' }), 'Hello, !');
  });

  await t.step(
    'should handle complex nested structures in template names',
    () => {
      const template = 'User: ${user.name}, Age: ${user.details.age}';
      const result = templatize(template);
      asserts.assertEquals(
        result({ 'user.name': 'John', 'user.details.age': '30' }),
        'User: John, Age: 30',
      );
    },
  );

  // Additional comprehensive tests for edge cases and advanced functionality
  await t.step('should handle templates with no variables efficiently', () => {
    const template = 'This is a static template with no variables.';
    const parser = templatize(template);

    // Should work with empty object
    asserts.assertEquals(
      parser({} as any),
      'This is a static template with no variables.',
    );

    // Should ignore any passed values
    asserts.assertEquals(
      parser({ ignored: 'value' } as any),
      'This is a static template with no variables.',
    );
  });

  await t.step('should handle duplicate variables correctly', () => {
    const template = '${greeting} ${name}! Hope you have a great day, ${name}!';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ greeting: 'Hello', name: 'Alice' }),
      'Hello Alice! Hope you have a great day, Alice!',
    );
  });

  await t.step('should handle variables with numbers and underscores', () => {
    const template = 'Item ${item_1} and ${item2} with ${special_item_3}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({
        item_1: 'first',
        item2: 'second',
        special_item_3: 'third',
      }),
      'Item first and second with third',
    );
  });

  await t.step('should handle very long variable names', () => {
    const longVarName = 'very_long_variable_name_that_might_cause_issues';
    const template = `Value: \${${longVarName}}`;
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ [longVarName]: 'success' } as any),
      'Value: success',
    );
  });

  await t.step('should handle templates with only variables', () => {
    const template = '${var1}${var2}${var3}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ var1: 'A', var2: 'B', var3: 'C' }),
      'ABC',
    );
  });

  await t.step('should handle single character variables', () => {
    const template = 'Coordinates: (${x}, ${y})';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ x: '10', y: '20' }),
      'Coordinates: (10, 20)',
    );
  });

  await t.step('should handle templates with braces in content', () => {
    const template = 'Object: { name: ${name}, value: ${value} }';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ name: 'test', value: '42' }),
      'Object: { name: test, value: 42 }',
    );
  });

  await t.step('should handle whitespace around variables', () => {
    const template = 'Value: ${ spaced } and ${normal}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ ' spaced ': 'with-spaces', normal: 'regular' }),
      'Value: with-spaces and regular',
    );
  });

  await t.step('should handle numeric string values', () => {
    const template = 'Count: ${count}, Price: $${price}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ count: '42', price: '19.99' }),
      'Count: 42, Price: $19.99',
    );
  });

  await t.step('should handle boolean-like string values', () => {
    const template = 'Active: ${active}, Verified: ${verified}';
    const parser = templatize(template);

    asserts.assertEquals(
      parser({ active: 'true', verified: 'false' }),
      'Active: true, Verified: false',
    );
  });
});

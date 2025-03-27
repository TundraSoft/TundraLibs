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
});

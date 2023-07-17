import { GuardianError, stringGuard } from '../mod.ts';

import { assertEquals, assertThrows } from '../../dev.dependencies.ts';

Deno.test({
  name: `[library='Guardian' method='String.capitalize'] Capitalize string`,
  fn: () => {
    // Test lowercase string
    assertEquals(stringGuard.capitalize().validate('hello'), [
      undefined,
      'Hello',
    ]);

    // Test uppercase string
    assertEquals(stringGuard.capitalize().validate('WORLD'), [
      undefined,
      'WORLD',
    ]);

    // Test mixed case string
    assertEquals(stringGuard.capitalize().validate('gREETING'), [
      undefined,
      'GREETING',
    ]);

    // Test empty string
    assertEquals(stringGuard.capitalize().validate(''), [undefined, '']);

    // Test string with special characters and numbers
    assertEquals(stringGuard.capitalize().validate('123abc!@#'), [
      undefined,
      '123abc!@#',
    ]);
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.lowerCase'] Convert string to lowercase`,
  fn: () => {
    // Test uppercase string
    assertEquals(stringGuard.lowerCase().validate('HELLO'), [
      undefined,
      'hello',
    ]);

    // Test lowercase string
    assertEquals(stringGuard.lowerCase().validate('world'), [
      undefined,
      'world',
    ]);

    // Test mixed case string
    assertEquals(stringGuard.lowerCase().validate('GreetING'), [
      undefined,
      'greeting',
    ]);

    // Test empty string
    assertEquals(stringGuard.lowerCase().validate(''), [undefined, '']);

    // Test string with special characters and numbers
    assertEquals(stringGuard.lowerCase().validate('123ABC!@#'), [
      undefined,
      '123abc!@#',
    ]);
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.upperCase'] Convert string to uppercase`,
  fn: () => {
    // Test lowercase string
    assertEquals(stringGuard.upperCase().validate('hello'), [
      undefined,
      'HELLO',
    ]);

    // Test uppercase string
    assertEquals(stringGuard.upperCase().validate('WORLD'), [
      undefined,
      'WORLD',
    ]);

    // Test mixed case string
    assertEquals(stringGuard.upperCase().validate('GreetING'), [
      undefined,
      'GREETING',
    ]);

    // Test empty string
    assertEquals(stringGuard.upperCase().validate(''), [undefined, '']);

    // Test string with special characters and numbers
    assertEquals(stringGuard.upperCase().validate('123abc!@#'), [
      undefined,
      '123ABC!@#',
    ]);
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.camelCase'] Convert string to camel case`,
  fn: () => {
    // Test sentence with spaces
    assertEquals(stringGuard.camelCase().validate('hello world'), [
      undefined,
      'helloWorld',
    ]);

    // Test sentence with hyphens
    assertEquals(stringGuard.camelCase().validate('hello-world'), [
      undefined,
      'helloWorld',
    ]);

    // Test sentence with underscores
    assertEquals(stringGuard.camelCase().validate('hello_world'), [
      undefined,
      'helloWorld',
    ]);

    // Test sentence with special characters
    assertEquals(stringGuard.camelCase().validate('Hello #!@$ World'), [
      undefined,
      'helloWorld',
    ]);

    // Test empty string
    assertEquals(stringGuard.camelCase().validate(''), [undefined, '']);
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.snakeCase'] Convert string to snake case`,
  fn: () => {
    // Test sentence with spaces
    assertEquals(stringGuard.snakeCase().validate('hello world'), [
      undefined,
      'hello_world',
    ]);

    // Test sentence with hyphens
    assertEquals(stringGuard.snakeCase().validate('hello-world'), [
      undefined,
      'hello_world',
    ]);

    // Test sentence with underscores
    assertEquals(stringGuard.snakeCase().validate('hello_world'), [
      undefined,
      'hello_world',
    ]);

    // Test sentence with special characters
    assertEquals(stringGuard.snakeCase().validate('Hello #!@$ World'), [
      undefined,
      'hello_world',
    ]);

    // Test empty string
    assertEquals(stringGuard.snakeCase().validate(''), [undefined, '']);
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.pascalCase'] Convert string to pascal case`,
  fn: () => {
    // Test sentence with spaces
    assertEquals(stringGuard.pascalCase().validate('hello world'), [
      undefined,
      'HelloWorld',
    ]);

    // Test sentence with hyphens
    assertEquals(stringGuard.pascalCase().validate('hello-world'), [
      undefined,
      'HelloWorld',
    ]);

    // Test sentence with underscores
    assertEquals(stringGuard.pascalCase().validate('hello_world'), [
      undefined,
      'HelloWorld',
    ]);

    // Test sentence with special characters
    assertEquals(stringGuard.pascalCase().validate('Hello #!@$ World'), [
      undefined,
      'HelloWorld',
    ]);

    // Test empty string
    assertEquals(stringGuard.pascalCase().validate(''), [undefined, '']);
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.trim'] Trim whitespace from start and end of the string`,
  fn: () => {
    // Test string with leading and trailing whitespace
    assertEquals(stringGuard.trim().validate('  hello world  '), [
      undefined,
      'hello world',
    ]);

    // Test string with only leading whitespace
    assertEquals(stringGuard.trim().validate('  hello world'), [
      undefined,
      'hello world',
    ]);

    // Test string with only trailing whitespace
    assertEquals(stringGuard.trim().validate('hello world  '), [
      undefined,
      'hello world',
    ]);

    // Test string without whitespace
    assertEquals(stringGuard.trim().validate('helloworld'), [
      undefined,
      'helloworld',
    ]);

    // Test empty string
    assertEquals(stringGuard.trim().validate(''), [undefined, '']);
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.replace'] Replace single occurrences of a string with another string`,
  fn: () => {
    const result = stringGuard.replace('foo', 'bar')('foo bar foo'); // Call the method being tested
    assertEquals(result, 'bar bar foo');
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.replace'] Replace all occurrences of a string with another string`,
  fn: () => {
    const result = stringGuard.replace('foo', 'bar', true)('foo bar foo'); // Call the method being tested
    assertEquals(result, 'bar bar bar');
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.replace'] Replace single occurrences of a pattern with another string`,
  fn: () => {
    const result = stringGuard.replace(/f[o]+/, 'bar')('fooooo bar foo'); // Call the method being tested
    assertEquals(result, 'bar bar foo');
    const result2 = stringGuard.replace(/f[o]+/g, 'bar')('foooo bar foo'); // Call the method being tested
    assertEquals(result2, 'bar bar foo');
  },
});

Deno.test({
  name:
    `[library='Guardian' method='String.replace'] Replace all occurrences of a pattern with another string`,
  fn: () => {
    const result = stringGuard.replace(/f[o]+/, 'bar', true)('foooo bar foo'); // Call the method being tested
    assertEquals(result, 'bar bar bar');
    const result2 = stringGuard.replace(/f[o]+/g, 'bar', true)('foooo bar foo'); // Call the method being tested
    assertEquals(result2, 'bar bar bar');
  },
});

Deno.test({
  name: 'String - Test basic string validation',
  fn(): void {
    assertEquals(stringGuard.trim().between(3, 40)('Abhinav '), 'Abhinav');
    assertEquals(
      stringGuard.trim().between(3, 40).email()('testmail@gmail.com'),
      'testmail@gmail.com',
    );
    assertEquals(stringGuard(' asd sd asd asd '), ' asd sd asd asd ');
    assertEquals(stringGuard.optional()(), undefined);
    assertThrows(() => stringGuard.aadhaar()('123456789'), GuardianError);
  },
});

Deno.test({
  name: 'String - Check if correct error message is coming',
  fn(): void {
    assertThrows(
      () => stringGuard.aadhaar('Value is not a valid AADHAAR')('123456789'),
      GuardianError,
      'Value is not a valid AADHAAR',
    );
  },
});

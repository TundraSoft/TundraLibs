import * as asserts from '$asserts';
import { GuardianError, StringGuardian } from '../../mod.ts';

Deno.test('guardian.StringGuardian', async (t) => {
  await t.step('basic functionality', async (t) => {
    await t.step('should validate string type', () => {
      const schema = new StringGuardian();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse(123), GuardianError);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
    });

    await t.step('should handle empty strings', () => {
      const schema = new StringGuardian();
      asserts.assertEquals(schema.parse(''), '');
    });

    await t.step('should preserve string values', () => {
      const schema = new StringGuardian();
      const testCases = ['hello', 'world', '123', 'special!@#$%'];

      for (const testCase of testCases) {
        asserts.assertEquals(schema.parse(testCase), testCase);
      }
    });
  });

  await t.step('length validations', async (t) => {
    await t.step('should validate minimum length', () => {
      const schema = new StringGuardian().minLength(3);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('abc'), 'abc');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError);
    });

    await t.step('should validate maximum length', () => {
      const schema = new StringGuardian().maxLength(5);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('hi'), 'hi');
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
    });

    await t.step('should validate exact length', () => {
      const schema = new StringGuardian().length(5);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
    });

    await t.step('should combine length validations', () => {
      const schema = new StringGuardian().minLength(2).maxLength(10);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('h'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world!'), GuardianError);
    });
  });

  await t.step('regex validation', async (t) => {
    await t.step('should validate against regex patterns', () => {
      const lettersOnly = new StringGuardian().regex(/^[a-zA-Z]+$/);

      asserts.assertEquals(lettersOnly.parse('hello'), 'hello');
      asserts.assertEquals(lettersOnly.parse('Hello'), 'Hello');
      asserts.assertThrows(() => lettersOnly.parse('hello123'), GuardianError);
      asserts.assertThrows(() => lettersOnly.parse('hello!'), GuardianError);
    });

    await t.step('should validate email format', () => {
      const email = new StringGuardian().email();

      asserts.assertEquals(email.parse('user@example.com'), 'user@example.com');
      asserts.assertEquals(
        email.parse('test.email+tag@domain.co.uk'),
        'test.email+tag@domain.co.uk',
      );
      asserts.assertThrows(() => email.parse('invalid-email'), GuardianError);
      asserts.assertThrows(() => email.parse('@domain.com'), GuardianError);
      asserts.assertThrows(() => email.parse('user@'), GuardianError);
    });

    await t.step('should validate URL format', () => {
      const url = new StringGuardian().url();

      asserts.assertEquals(
        url.parse('https://example.com'),
        'https://example.com',
      );
      asserts.assertEquals(
        url.parse('http://localhost:3000'),
        'http://localhost:3000',
      );
      asserts.assertEquals(url.parse('ftp://example.com'), 'ftp://example.com'); // ftp is valid
      asserts.assertThrows(() => url.parse('invalid-url'), GuardianError);
      asserts.assertThrows(() => url.parse('not a url at all'), GuardianError);
    });
  });

  await t.step('transformations', async (t) => {
    await t.step('should transform to uppercase', () => {
      const schema = new StringGuardian().toUpperCase();

      asserts.assertEquals(schema.parse('hello'), 'HELLO');
      asserts.assertEquals(schema.parse('Hello World'), 'HELLO WORLD');
    });

    await t.step('should transform to lowercase', () => {
      const schema = new StringGuardian().toLowerCase();

      asserts.assertEquals(schema.parse('HELLO'), 'hello');
      asserts.assertEquals(schema.parse('Hello World'), 'hello world');
    });

    await t.step('should trim whitespace', () => {
      const schema = new StringGuardian().trim();

      asserts.assertEquals(schema.parse('  hello  '), 'hello');
      asserts.assertEquals(schema.parse('\n\tworld\n'), 'world');
    });

    await t.step('should chain transformations', () => {
      const schema = new StringGuardian().trim().toLowerCase().toUpperCase();

      asserts.assertEquals(schema.parse('  Hello World  '), 'HELLO WORLD');
    });
  });

  await t.step('type transformations', async (t) => {
    await t.step('should convert string to number', () => {
      const schema = new StringGuardian().toNumber();

      asserts.assertEquals(schema.parse('123'), 123);
      asserts.assertEquals(schema.parse('3.14'), 3.14);
      asserts.assertEquals(schema.parse('-42'), -42);
      asserts.assertEquals(schema.parse(''), 0); // empty string converts to 0
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse('not a number'), GuardianError);
    });

    await t.step('should convert string to integer', () => {
      const schema = new StringGuardian().toInt();

      asserts.assertEquals(schema.parse('123'), 123);
      asserts.assertEquals(schema.parse('-42'), -42);
      asserts.assertEquals(schema.parse('3.14'), 3); // parseInt('3.14') gives 3
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError); // parseInt('') is NaN
    });

    await t.step('should convert string to date', () => {
      const schema = new StringGuardian().toDate();

      const date = schema.parse('2023-01-01T00:00:00.000Z');
      asserts.assert(date instanceof Date);
      asserts.assertEquals(date.getFullYear(), 2023);

      asserts.assertThrows(() => schema.parse('invalid-date'), GuardianError);
    });
  });

  await t.step('safe parsing', async (t) => {
    await t.step('should return success result for valid input', () => {
      const schema = new StringGuardian().minLength(3);
      const result = schema.safeParse('hello');

      const [error, data] = result;
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    await t.step('should return error result for invalid input', () => {
      const schema = new StringGuardian().minLength(3);
      const result = schema.safeParse('hi');

      const [error, data] = result;
      asserts.assert(error instanceof GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step('error handling', async (t) => {
    await t.step('should provide detailed error messages', () => {
      const schema = new StringGuardian().minLength(5);

      asserts.assertThrows(
        () => schema.parse('hi'),
        GuardianError,
        'String must be at least 5 characters long',
      );
    });

    await t.step('should support custom error messages', () => {
      const schema = new StringGuardian().minLength(5, 'Too short!');

      asserts.assertThrows(
        () => schema.parse('hi'),
        GuardianError,
        'Too short!',
      );
    });
  });

  await t.step('metadata handling', async (t) => {
    await t.step('should store and retrieve metadata', () => {
      const metaData = {
        description: 'User name field',
        title: 'Name',
        examples: ['John', 'Jane'],
      };

      const schema = new StringGuardian(metaData);
      asserts.assertEquals(schema.metaData, metaData);
    });

    await t.step('should allow setting metadata properties', () => {
      const schema = new StringGuardian();
      schema.description = 'Test description';
      schema.title = 'Test Title';
      schema.examples = ['example1', 'example2'];

      asserts.assertEquals(schema.metaData?.description, 'Test description');
      asserts.assertEquals(schema.metaData?.title, 'Test Title');

      asserts.assertArrayIncludes(schema.metaData?.examples || [], [
        'example1',
        'example2',
      ]);
    });
  });
});

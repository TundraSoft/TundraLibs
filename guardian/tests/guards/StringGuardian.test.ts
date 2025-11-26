import * as asserts from '$asserts';
import { GuardianError, StringGuardian } from '../../mod.ts';

Deno.test('guardian.StringGuardian', async (t) => {
  await t.step('basic functionality', async (u) => {
    await u.step('should validate string type', () => {
      const schema = new StringGuardian();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse(123), GuardianError);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
    });

    await u.step('should handle empty strings', () => {
      const schema = new StringGuardian();
      asserts.assertEquals(schema.parse(''), '');
    });

    await u.step('should preserve string values', () => {
      const schema = new StringGuardian();
      const testCases = ['hello', 'world', '123', 'special!@#$%'];

      for (const testCase of testCases) {
        asserts.assertEquals(schema.parse(testCase), testCase);
      }
    });
  });

  await t.step('length validations', async (u) => {
    await u.step('should validate minimum length', () => {
      const schema = new StringGuardian().minLength(3);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('abc'), 'abc');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError);
    });

    await u.step('should validate maximum length', () => {
      const schema = new StringGuardian().maxLength(5);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('hi'), 'hi');
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
    });

    await u.step('should validate exact length', () => {
      const schema = new StringGuardian().length(5);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
    });

    await u.step('should combine length validations', () => {
      const schema = new StringGuardian().minLength(2).maxLength(10);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('h'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world!'), GuardianError);
    });
  });

  await t.step('pattern validation', async (u) => {
    await u.step('should validate against regex patterns', () => {
      const lettersOnly = new StringGuardian().pattern(/^[a-zA-Z]+$/);

      asserts.assertEquals(lettersOnly.parse('hello'), 'hello');
      asserts.assertEquals(lettersOnly.parse('Hello'), 'Hello');
      asserts.assertThrows(() => lettersOnly.parse('hello123'), GuardianError);
      asserts.assertThrows(() => lettersOnly.parse('hello!'), GuardianError);
    });

    await u.step('should validate email format', () => {
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

    await u.step('should validate URL format', () => {
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

  await t.step('transformations', async (u) => {
    await u.step('should transform to uppercase', () => {
      const schema = new StringGuardian().toUpperCase();

      asserts.assertEquals(schema.parse('hello'), 'HELLO');
      asserts.assertEquals(schema.parse('Hello World'), 'HELLO WORLD');
    });

    await u.step('should transform to lowercase', () => {
      const schema = new StringGuardian().toLowerCase();

      asserts.assertEquals(schema.parse('HELLO'), 'hello');
      asserts.assertEquals(schema.parse('Hello World'), 'hello world');
    });

    await u.step('should trim whitespace', () => {
      const schema = new StringGuardian().trim();

      asserts.assertEquals(schema.parse('  hello  '), 'hello');
      asserts.assertEquals(schema.parse('\n\tworld\n'), 'world');
    });

    await u.step('should chain transformations', () => {
      const schema = new StringGuardian().trim().toLowerCase().toUpperCase();

      asserts.assertEquals(schema.parse('  Hello World  '), 'HELLO WORLD');
    });
  });

  await t.step('type transformations', async (u) => {
    await u.step('should convert string to number', () => {
      const schema = new StringGuardian().toNumber();

      asserts.assertEquals(schema.parse('123'), 123);
      asserts.assertEquals(schema.parse('3.14'), 3.14);
      asserts.assertEquals(schema.parse('-42'), -42);
      asserts.assertEquals(schema.parse(''), 0); // empty string converts to 0
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse('not a number'), GuardianError);
    });

    await u.step('should convert string to integer', () => {
      const schema = new StringGuardian().toInt();

      asserts.assertEquals(schema.parse('123'), 123);
      asserts.assertEquals(schema.parse('-42'), -42);
      asserts.assertEquals(schema.parse('3.14'), 3); // parseInt('3.14') gives 3
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError); // parseInt('') is NaN
    });

    await u.step('should convert string to date', () => {
      const schema = new StringGuardian().toDate();

      const date = schema.parse('2023-01-01T00:00:00.000Z');
      asserts.assert(date instanceof Date);
      asserts.assertEquals(date.getFullYear(), 2023);

      asserts.assertThrows(() => schema.parse('invalid-date'), GuardianError);
    });
  });

  await t.step('safe parsing', async (u) => {
    await u.step('should return success result for valid input', () => {
      const schema = new StringGuardian().minLength(3);
      const result = schema.safeParse('hello');

      const [error, data] = result;
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    await u.step('should return error result for invalid input', () => {
      const schema = new StringGuardian().minLength(3);
      const result = schema.safeParse('hi');

      const [error, data] = result;
      asserts.assert(error instanceof GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step('error handling', async (u) => {
    await u.step('should provide detailed error messages', () => {
      const schema = new StringGuardian().minLength(5);

      asserts.assertThrows(
        () => schema.parse('hi'),
        GuardianError,
        'String must be at least 5 characters long',
      );
    });

    await u.step('should support custom error messages', () => {
      const schema = new StringGuardian().minLength(5, 'Too short!');

      asserts.assertThrows(
        () => schema.parse('hi'),
        GuardianError,
        'Too short!',
      );
    });
  });

  await t.step('metadata handling', async (u) => {
    await u.step('should store and retrieve metadata', () => {
      const metaData = {
        description: 'User name field',
        title: 'Name',
        examples: ['John', 'Jane'],
      };

      const schema = new StringGuardian(undefined, metaData);
      asserts.assertEquals(schema.metaData, metaData);
    });

    await u.step('should allow setting metadata properties', () => {
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

  await t.step('character validations', async (u) => {
    await u.step('should validate alpha characters', () => {
      const schema = new StringGuardian().alpha();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('WORLD'), 'WORLD');
      asserts.assertEquals(schema.parse('AbCdEf'), 'AbCdEf');
      asserts.assertThrows(() => schema.parse('hello123'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello!'), GuardianError);
    });

    await u.step('should validate alphanumeric characters', () => {
      const schema = new StringGuardian().alphanumeric();

      asserts.assertEquals(schema.parse('hello123'), 'hello123');
      asserts.assertEquals(schema.parse('ABC123'), 'ABC123');
      asserts.assertEquals(schema.parse('123'), '123');
      asserts.assertEquals(schema.parse('abc'), 'abc');
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello!'), GuardianError);
      asserts.assertThrows(() => schema.parse('test@email.com'), GuardianError);
    });
  });

  await t.step('uuid validations', async (u) => {
    await u.step('should validate UUID format', () => {
      const schema = new StringGuardian().uuid();

      asserts.assertEquals(
        schema.parse('550e8400-e29b-41d4-a716-446655440000'),
        '550e8400-e29b-41d4-a716-446655440000',
      );
      asserts.assertEquals(
        schema.parse('6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      );
      asserts.assertThrows(() => schema.parse('not-a-uuid'), GuardianError);
      asserts.assertThrows(
        () => schema.parse('550e8400-e29b-41d4-a716'),
        GuardianError,
      );
      asserts.assertThrows(
        () => schema.parse('550e8400-e29b-41d4-a716-446655440000-extra'),
        GuardianError,
      );
    });

    await u.step('should validate UUID v1 format', () => {
      const schema = new StringGuardian().uuidv1();

      asserts.assertEquals(
        schema.parse('6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      );
      asserts.assertThrows(
        () => schema.parse('550e8400-e29b-41d4-a716-446655440000'),
        GuardianError,
      ); // v4 UUID
      asserts.assertThrows(() => schema.parse('not-a-uuid'), GuardianError);
    });

    await u.step('should validate UUID v4 format', () => {
      const schema = new StringGuardian().uuidv4();

      asserts.assertEquals(
        schema.parse('550e8400-e29b-41d4-a716-446655440000'),
        '550e8400-e29b-41d4-a716-446655440000',
      );
      asserts.assertThrows(
        () => schema.parse('6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
        GuardianError,
      ); // v1 UUID
      asserts.assertThrows(() => schema.parse('not-a-uuid'), GuardianError);
    });
  });

  await t.step('content validations', async (u) => {
    await u.step('should validate contains', () => {
      const schema = new StringGuardian().contains('world');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('world hello'), 'world hello');
      asserts.assertEquals(schema.parse('worldwide'), 'worldwide');
      asserts.assertThrows(() => schema.parse('hello earth'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError);
    });

    await u.step('should validate notContains', () => {
      const schema = new StringGuardian().notContains('bad');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('good morning'), 'good morning');
      asserts.assertThrows(() => schema.parse('bad news'), GuardianError);
      asserts.assertThrows(() => schema.parse('not bad'), GuardianError);
      asserts.assertThrows(() => schema.parse('badger'), GuardianError);
    });

    await u.step('should validate startsWith', () => {
      const schema = new StringGuardian().startsWith('hello');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('hi world'), GuardianError);
      asserts.assertThrows(() => schema.parse('world hello'), GuardianError);
    });

    await u.step('should validate endsWith', () => {
      const schema = new StringGuardian().endsWith('world');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('world'), 'world');
      asserts.assertThrows(() => schema.parse('hello earth'), GuardianError);
      asserts.assertThrows(() => schema.parse('world hello'), GuardianError);
    });

    await u.step('should validate notStartsWith', () => {
      const schema = new StringGuardian().notStartsWith('bad');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('good morning'), 'good morning');
      asserts.assertThrows(() => schema.parse('bad news'), GuardianError);
      asserts.assertThrows(() => schema.parse('badger'), GuardianError);
    });

    await u.step('should validate notEndsWith', () => {
      const schema = new StringGuardian().notEndsWith('bad');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('good morning'), 'good morning');
      asserts.assertThrows(() => schema.parse('news bad'), GuardianError);
      asserts.assertThrows(() => schema.parse('not bad'), GuardianError);
    });

    await u.step('should validate notEmpty', () => {
      const schema = new StringGuardian().notEmpty();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('a'), 'a');
      asserts.assertThrows(() => schema.parse(''), GuardianError);
      asserts.assertThrows(() => schema.parse('   '), GuardianError);
      asserts.assertThrows(() => schema.parse('\t\n'), GuardianError);
    });
  });

  await t.step('string transformations', async (u) => {
    await u.step('should strip spaces', () => {
      const schema = new StringGuardian().stripSpaces();

      asserts.assertEquals(schema.parse('hello world'), 'helloworld');
      asserts.assertEquals(schema.parse('  hello  world  '), 'helloworld');
      asserts.assertEquals(schema.parse('a b c d'), 'abcd');
      asserts.assertEquals(schema.parse('nospaces'), 'nospaces');
    });

    await u.step('should replace text', () => {
      const schema = new StringGuardian().replace('world', 'universe');

      asserts.assertEquals(schema.parse('hello world'), 'hello universe');
      asserts.assertEquals(schema.parse('world peace'), 'universe peace');
      asserts.assertEquals(schema.parse('no match'), 'no match');
    });

    await u.step('should replace with regex', () => {
      const schema = new StringGuardian().replace(/\d+/g, 'X');

      asserts.assertEquals(schema.parse('hello123world456'), 'helloXworldX');
      asserts.assertEquals(schema.parse('no numbers'), 'no numbers');
    });

    await u.step('should add prefix', () => {
      const schema = new StringGuardian().prefix('Hello ');

      asserts.assertEquals(schema.parse('world'), 'Hello world');
      asserts.assertEquals(schema.parse(''), 'Hello ');
    });

    await u.step('should add suffix', () => {
      const schema = new StringGuardian().suffix(' world');

      asserts.assertEquals(schema.parse('Hello'), 'Hello world');
      asserts.assertEquals(schema.parse(''), ' world');
    });
  });

  await t.step('nullable and optional', async (u) => {
    await u.step('should handle nullable strings', () => {
      const schema = new StringGuardian().minLength(3).nullable();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
    });

    await u.step('should handle optional strings', () => {
      const schema = new StringGuardian().minLength(3).optional();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
    });

    await u.step('should handle optional with default', () => {
      const schema = new StringGuardian().minLength(3).optional('default');

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse(undefined), 'default');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
    });

    await u.step('should handle nullable and optional separately', () => {
      // Test nullable
      const nullableSchema = new StringGuardian().minLength(2).nullable();
      asserts.assertEquals(nullableSchema.parse('hello'), 'hello');
      asserts.assertEquals(nullableSchema.parse(null), null);
      asserts.assertThrows(() => nullableSchema.parse('x'), GuardianError);

      // Test optional
      const optionalSchema = new StringGuardian().minLength(2).optional(
        'default',
      );
      asserts.assertEquals(optionalSchema.parse('hello'), 'hello');
      asserts.assertEquals(optionalSchema.parse(undefined), 'default');
      asserts.assertThrows(() => optionalSchema.parse('x'), GuardianError);
    });

    await u.step('should handle nullable().optional() chaining', () => {
      const schema = new StringGuardian().minLength(2).nullable().optional(
        'default',
      );

      asserts.assertEquals(schema.parse('hello'), 'hello'); // valid string
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 'default'); // default used
      asserts.assertThrows(() => schema.parse('x'), GuardianError); // validation still works
    });

    await u.step('should handle optional().nullable() chaining', () => {
      const schema = new StringGuardian().minLength(2).optional('default')
        .nullable();

      asserts.assertEquals(schema.parse('hello'), 'hello'); // valid string
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 'default'); // default used
      asserts.assertThrows(() => schema.parse('x'), GuardianError); // validation still works
    });

    await u.step('should work with transformations', () => {
      const schema = new StringGuardian().trim().toUpperCase().optional();

      asserts.assertEquals(schema.parse('  hello  '), 'HELLO');
      asserts.assertEquals(schema.parse(undefined), undefined);
    });

    await u.step('should work with format validations', () => {
      const schema = new StringGuardian().email().nullable();

      asserts.assertEquals(
        schema.parse('test@example.com'),
        'test@example.com',
      );
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse('invalid-email'), GuardianError);
    });
  });

  await t.step('chained validations', async (u) => {
    await u.step('should chain multiple validations', () => {
      const schema = new StringGuardian()
        .minLength(3)
        .maxLength(10)
        .alpha()
        .startsWith('h')
        .endsWith('o');

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError); // too short
      asserts.assertThrows(() => schema.parse('hello123'), GuardianError); // not alpha
      asserts.assertThrows(() => schema.parse('world'), GuardianError); // doesn't start with h
      asserts.assertThrows(() => schema.parse('help'), GuardianError); // doesn't end with o
    });

    await u.step('should chain validations and transformations', () => {
      const schema = new StringGuardian()
        .trim()
        .toLowerCase()
        .minLength(3)
        .startsWith('hello');

      asserts.assertEquals(schema.parse('  HELLO WORLD  '), 'hello world');
      asserts.assertThrows(() => schema.parse('  HI  '), GuardianError); // too short after trim
      asserts.assertThrows(() => schema.parse('  WORLD  '), GuardianError); // doesn't start with hello
    });
  });

  await t.step('new validation methods', async (u) => {
    await u.step('phone validation', () => {
      const schema = new StringGuardian().phone();

      // Valid phone numbers
      asserts.assertEquals(schema.parse('123-456-7890'), '123-456-7890');
      asserts.assertEquals(schema.parse('(123) 456-7890'), '(123) 456-7890');
      asserts.assertEquals(schema.parse('+1-123-456-7890'), '+1-123-456-7890');
      asserts.assertEquals(schema.parse('1234567890'), '1234567890');

      // Invalid phone numbers
      asserts.assertThrows(() => schema.parse('123-456'), GuardianError);
      asserts.assertThrows(() => schema.parse('not-a-phone'), GuardianError);
      asserts.assertThrows(() => schema.parse('123-456-78901'), GuardianError);
    });

    await u.step('phone validation with custom pattern', () => {
      const customPattern = /^\d{3}-\d{3}-\d{4}$/;
      const schema = new StringGuardian().phone(customPattern);

      asserts.assertEquals(schema.parse('123-456-7890'), '123-456-7890');
      asserts.assertThrows(() => schema.parse('(123) 456-7890'), GuardianError);
    });

    await u.step('ipAddress validation', () => {
      const schema = new StringGuardian().ipAddress();

      // Valid IPv4
      asserts.assertEquals(schema.parse('192.168.1.1'), '192.168.1.1');
      asserts.assertEquals(schema.parse('0.0.0.0'), '0.0.0.0');
      asserts.assertEquals(schema.parse('255.255.255.255'), '255.255.255.255');

      // Valid IPv6
      asserts.assertEquals(
        schema.parse('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      );

      // Invalid
      asserts.assertThrows(
        () => schema.parse('256.256.256.256'),
        GuardianError,
      );
      asserts.assertThrows(() => schema.parse('not-an-ip'), GuardianError);
    });

    await u.step('ipv4 validation', () => {
      const schema = new StringGuardian().ipv4();

      asserts.assertEquals(schema.parse('192.168.1.1'), '192.168.1.1');
      asserts.assertEquals(schema.parse('127.0.0.1'), '127.0.0.1');
      asserts.assertThrows(() => schema.parse('256.1.1.1'), GuardianError);
      asserts.assertThrows(() => schema.parse('2001:db8::1'), GuardianError);
    });

    await u.step('ipv6 validation', () => {
      const schema = new StringGuardian().ipv6();

      asserts.assertEquals(
        schema.parse('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      );
      asserts.assertThrows(() => schema.parse('192.168.1.1'), GuardianError);
      asserts.assertThrows(() => schema.parse('invalid-ipv6'), GuardianError);
    });

    await u.step('internalIp validation', () => {
      const schema = new StringGuardian().internalIp();

      // Valid internal IPs
      asserts.assertEquals(schema.parse('192.168.1.1'), '192.168.1.1');
      asserts.assertEquals(schema.parse('10.0.0.1'), '10.0.0.1');
      asserts.assertEquals(schema.parse('172.16.0.1'), '172.16.0.1');
      asserts.assertEquals(schema.parse('127.0.0.1'), '127.0.0.1');

      // Invalid (public IPs)
      asserts.assertThrows(() => schema.parse('8.8.8.8'), GuardianError);
      asserts.assertThrows(() => schema.parse('1.1.1.1'), GuardianError);
      asserts.assertThrows(() => schema.parse('172.15.0.1'), GuardianError); // outside private range
    });

    await u.step('macAddress validation', () => {
      const schema = new StringGuardian().macAddress();

      asserts.assertEquals(
        schema.parse('00:11:22:33:44:55'),
        '00:11:22:33:44:55',
      );
      asserts.assertEquals(
        schema.parse('AA-BB-CC-DD-EE-FF'),
        'AA-BB-CC-DD-EE-FF',
      );
      asserts.assertThrows(() => schema.parse('00:11:22:33:44'), GuardianError);
      asserts.assertThrows(
        () => schema.parse('GG:HH:II:JJ:KK:LL'),
        GuardianError,
      );
    });

    await u.step('creditCard validation', () => {
      const schema = new StringGuardian().creditCard();

      // Test valid Visa (starts with 4)
      asserts.assertEquals(
        schema.parse('4000000000000002'),
        '4000000000000002',
      );

      // Test invalid (fails Luhn check)
      asserts.assertThrows(
        () => schema.parse('4000000000000000'),
        GuardianError,
      );
      asserts.assertThrows(() => schema.parse('123456'), GuardianError);
    });

    await u.step('creditCard validation by type', () => {
      const visaSchema = new StringGuardian().creditCard('visa');
      const mastercardSchema = new StringGuardian().creditCard('mastercard');

      asserts.assertEquals(
        visaSchema.parse('4000000000000002'),
        '4000000000000002',
      );
      asserts.assertThrows(
        () => mastercardSchema.parse('4000000000000002'),
        GuardianError,
      ); // Visa number on Mastercard schema
    });

    await u.step('slug validation', () => {
      const schema = new StringGuardian().slug();

      asserts.assertEquals(schema.parse('hello-world'), 'hello-world');
      asserts.assertEquals(schema.parse('test123'), 'test123');
      asserts.assertThrows(() => schema.parse('Hello-World'), GuardianError); // uppercase
      asserts.assertThrows(() => schema.parse('hello_world'), GuardianError); // underscore
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError); // space
    });

    await u.step('hexColor validation', () => {
      const schema = new StringGuardian().hexColor();

      asserts.assertEquals(schema.parse('#fff'), '#fff');
      asserts.assertEquals(schema.parse('#ffffff'), '#ffffff');
      asserts.assertEquals(schema.parse('#123ABC'), '#123ABC');
      asserts.assertThrows(() => schema.parse('fff'), GuardianError); // missing #
      asserts.assertThrows(() => schema.parse('#gggggg'), GuardianError); // invalid hex
    });

    await u.step('domain validation', () => {
      const schema = new StringGuardian().domain();

      asserts.assertEquals(schema.parse('example.com'), 'example.com');
      asserts.assertEquals(schema.parse('sub.example.com'), 'sub.example.com');
      asserts.assertEquals(schema.parse('localhost'), 'localhost');
      asserts.assertThrows(() => schema.parse(''), GuardianError);
      asserts.assertThrows(() => schema.parse('.com'), GuardianError);
    });

    await u.step('noWhitespace validation', () => {
      const schema = new StringGuardian().noWhitespace();

      asserts.assertEquals(schema.parse('helloworld'), 'helloworld');
      asserts.assertEquals(schema.parse('test123'), 'test123');
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
      asserts.assertThrows(() => schema.parse('test\t123'), GuardianError);
      asserts.assertThrows(() => schema.parse('test\n123'), GuardianError);
    });

    await u.step('ascii validation', () => {
      const schema = new StringGuardian().ascii();

      asserts.assertEquals(
        schema.parse('Hello World 123!'),
        'Hello World 123!',
      );
      asserts.assertThrows(() => schema.parse('Héllo'), GuardianError); // non-ASCII
      asserts.assertThrows(() => schema.parse('🌍'), GuardianError); // emoji
    });

    await u.step('noSqlInjection validation', () => {
      const schema = new StringGuardian().noSqlInjection();

      asserts.assertEquals(schema.parse('normal text'), 'normal text');
      asserts.assertEquals(schema.parse('user123'), 'user123');
      asserts.assertThrows(() => schema.parse("' OR '1'='1"), GuardianError);
      asserts.assertThrows(
        () => schema.parse('UNION SELECT * FROM users'),
        GuardianError,
      );
      asserts.assertThrows(
        () => schema.parse('; DROP TABLE users'),
        GuardianError,
      );
    });

    await u.step('noXss validation', () => {
      const schema = new StringGuardian().noXss();

      asserts.assertEquals(schema.parse('normal text'), 'normal text');
      asserts.assertEquals(
        schema.parse('safe HTML content'),
        'safe HTML content',
      );
      asserts.assertThrows(
        () => schema.parse("<script>alert('xss')</script>"),
        GuardianError,
      );
      asserts.assertThrows(
        () => schema.parse("<img onload='alert(1)' src='x'>"),
        GuardianError,
      );
      asserts.assertThrows(
        () => schema.parse('javascript:alert(1)'),
        GuardianError,
      );
    });
  });

  await t.step('new transformation methods', async (u) => {
    await u.step('capitalize transformation', () => {
      const schema = new StringGuardian().capitalize();

      asserts.assertEquals(schema.parse('hello world'), 'Hello World');
      asserts.assertEquals(schema.parse('test case'), 'Test Case');
      asserts.assertEquals(schema.parse('already Correct'), 'Already Correct');
    });

    await u.step('camelCase transformation', () => {
      const schema = new StringGuardian().camelCase();

      asserts.assertEquals(schema.parse('hello world'), 'helloWorld');
      asserts.assertEquals(schema.parse('test-case'), 'testCase');
      asserts.assertEquals(schema.parse('snake_case'), 'snakeCase');
      asserts.assertEquals(schema.parse('Already Correct'), 'alreadyCorrect');
    });

    await u.step('snakeCase transformation', () => {
      const schema = new StringGuardian().snakeCase();

      asserts.assertEquals(schema.parse('hello world'), 'hello_world');
      asserts.assertEquals(schema.parse('testCase'), 'test_case');
      asserts.assertEquals(schema.parse('kebab-case'), 'kebab_case');
      asserts.assertEquals(schema.parse('PascalCase'), 'pascal_case');
    });

    await u.step('kebabCase transformation', () => {
      const schema = new StringGuardian().kebabCase();

      asserts.assertEquals(schema.parse('hello world'), 'hello-world');
      asserts.assertEquals(schema.parse('testCase'), 'test-case');
      asserts.assertEquals(schema.parse('snake_case'), 'snake-case');
      asserts.assertEquals(schema.parse('PascalCase'), 'pascal-case');
    });

    await u.step('pascalCase transformation', () => {
      const schema = new StringGuardian().pascalCase();

      asserts.assertEquals(schema.parse('hello world'), 'HelloWorld');
      asserts.assertEquals(schema.parse('test-case'), 'TestCase');
      asserts.assertEquals(schema.parse('snake_case'), 'SnakeCase');
      asserts.assertEquals(schema.parse('camelCase'), 'Camelcase');
    });

    await u.step('reverse transformation', () => {
      const schema = new StringGuardian().reverse();

      asserts.assertEquals(schema.parse('hello'), 'olleh');
      asserts.assertEquals(schema.parse('world'), 'dlrow');
      asserts.assertEquals(schema.parse('12345'), '54321');
    });

    await u.step('padStart transformation', () => {
      const schema = new StringGuardian().padStart(5, '0');

      asserts.assertEquals(schema.parse('123'), '00123');
      asserts.assertEquals(schema.parse('12345'), '12345');
      asserts.assertEquals(schema.parse('123456'), '123456'); // longer than target
    });

    await u.step('padEnd transformation', () => {
      const schema = new StringGuardian().padEnd(5, '0');

      asserts.assertEquals(schema.parse('123'), '12300');
      asserts.assertEquals(schema.parse('12345'), '12345');
      asserts.assertEquals(schema.parse('123456'), '123456'); // longer than target
    });

    await u.step('sanitize transformation', () => {
      const schema = new StringGuardian().sanitize();

      asserts.assertEquals(schema.parse('normal text'), 'normal text');
      asserts.assertEquals(schema.parse("<script>alert('bad')</script>"), '');
      asserts.assertEquals(
        schema.parse('Hello & <world>'),
        'Hello &amp; &lt;world&gt;',
      );
      asserts.assertEquals(schema.parse('onclick="alert(1)"'), '');
    });

    await u.step('normalizeSpace transformation', () => {
      const schema = new StringGuardian().normalizeSpace();

      asserts.assertEquals(schema.parse('  hello   world  '), 'hello world');
      asserts.assertEquals(schema.parse('test\t\n  spaces'), 'test spaces');
      asserts.assertEquals(schema.parse('already normal'), 'already normal');
    });
  });

  await t.step('nullable and optional scenarios', async (u) => {
    await u.step('nullable phone validation', () => {
      const schema = new StringGuardian().phone().nullable();

      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse('123-456-7890'), '123-456-7890');
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse('invalid'), GuardianError);
    });

    await u.step('optional creditCard validation', () => {
      const schema = new StringGuardian().creditCard().optional();

      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertEquals(
        schema.parse('4000000000000002'),
        '4000000000000002',
      );
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse('invalid'), GuardianError);
    });

    await u.step('optional with default camelCase', () => {
      const schema = new StringGuardian().camelCase().optional('defaultValue');

      asserts.assertEquals(schema.parse(undefined), 'defaultvalue');
      asserts.assertEquals(schema.parse('hello world'), 'helloWorld');
    });
  });
});

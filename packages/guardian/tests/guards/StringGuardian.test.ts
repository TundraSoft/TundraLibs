import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { GuardianError, StringGuardian } from '../../mod.ts';

describe('guardian.StringGuardian', () => {
  describe('basic functionality', () => {
    it('should validate string type', () => {
      const schema = new StringGuardian();

      asserts.assertEquals(schema.parse('hello'), 'hello');

      // Coerce-by-default: primitives + valid Date coerce to string.
      asserts.assertEquals(schema.parse(123), '123');
      asserts.assertEquals(schema.parse(true), 'true');
      asserts.assertEquals(schema.parse(false), 'false');
      asserts.assertEquals(schema.parse(42n), '42');

      // Non-coercible inputs still throw.
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse({}), GuardianError);
      asserts.assertThrows(() => schema.parse([]), GuardianError);
      asserts.assertThrows(() => schema.parse(Number.NaN), GuardianError);
    });

    it('should handle empty strings', () => {
      const schema = new StringGuardian();
      asserts.assertEquals(schema.parse(''), '');
    });

    it('should preserve string values', () => {
      const schema = new StringGuardian();
      const testCases = ['hello', 'world', '123', 'special!@#$%'];

      for (const testCase of testCases) {
        asserts.assertEquals(schema.parse(testCase), testCase);
      }
    });
  });

  describe('length validations', () => {
    it('should validate minimum length', () => {
      const schema = new StringGuardian().minLength(3);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('abc'), 'abc');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError);
    });

    it('should validate maximum length', () => {
      const schema = new StringGuardian().maxLength(5);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('hi'), 'hi');
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
    });

    it('should validate exact length', () => {
      const schema = new StringGuardian().length(5);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
    });

    it('should combine length validations', () => {
      const schema = new StringGuardian().minLength(2).maxLength(10);

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('h'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world!'), GuardianError);
    });
  });

  describe('pattern validation', () => {
    it('should validate against regex patterns', () => {
      const lettersOnly = new StringGuardian().pattern(/^[a-zA-Z]+$/);

      asserts.assertEquals(lettersOnly.parse('hello'), 'hello');
      asserts.assertEquals(lettersOnly.parse('Hello'), 'Hello');
      asserts.assertThrows(() => lettersOnly.parse('hello123'), GuardianError);
      asserts.assertThrows(() => lettersOnly.parse('hello!'), GuardianError);
    });

    it('should validate email format', () => {
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

    it('should validate URL format', () => {
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

  describe('transformations', () => {
    it('should transform to uppercase', () => {
      const schema = new StringGuardian().toUpperCase();

      asserts.assertEquals(schema.parse('hello'), 'HELLO');
      asserts.assertEquals(schema.parse('Hello World'), 'HELLO WORLD');
    });

    it('should transform to lowercase', () => {
      const schema = new StringGuardian().toLowerCase();

      asserts.assertEquals(schema.parse('HELLO'), 'hello');
      asserts.assertEquals(schema.parse('Hello World'), 'hello world');
    });

    it('should trim whitespace', () => {
      const schema = new StringGuardian().trim();

      asserts.assertEquals(schema.parse('  hello  '), 'hello');
      asserts.assertEquals(schema.parse('\n\tworld\n'), 'world');
    });

    it('should chain transformations', () => {
      const schema = new StringGuardian().trim().toLowerCase().toUpperCase();

      asserts.assertEquals(schema.parse('  Hello World  '), 'HELLO WORLD');
    });
  });

  describe('type transformations', () => {
    it('should convert string to number', () => {
      const schema = new StringGuardian().toNumber();

      asserts.assertEquals(schema.parse('123'), 123);
      asserts.assertEquals(schema.parse('3.14'), 3.14);
      asserts.assertEquals(schema.parse('-42'), -42);
      asserts.assertEquals(schema.parse(''), 0); // empty string converts to 0
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse('not a number'), GuardianError);
    });

    it('should convert string to integer', () => {
      const schema = new StringGuardian().toInt();

      asserts.assertEquals(schema.parse('123'), 123);
      asserts.assertEquals(schema.parse('-42'), -42);
      asserts.assertEquals(schema.parse(' 12 '), 12); // surrounding whitespace trimmed
      // Strict: the full (trimmed) string must be an integer literal —
      // `parseInt`'s lenient "stop at first non-digit" is rejected.
      asserts.assertThrows(() => schema.parse('3.14'), GuardianError); // not an integer
      asserts.assertThrows(() => schema.parse('12abc'), GuardianError); // trailing garbage
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError); // empty is not an integer
    });

    it('should convert string to date', () => {
      const schema = new StringGuardian().toDate();

      const date = schema.parse('2023-01-01T00:00:00.000Z');
      asserts.assert(date instanceof Date);
      asserts.assertEquals(date.getFullYear(), 2023);

      asserts.assertThrows(() => schema.parse('invalid-date'), GuardianError);
    });
  });

  describe('safe parsing', () => {
    it('should return success result for valid input', () => {
      const schema = new StringGuardian().minLength(3);
      const result = schema.safeParse('hello');

      const [error, data] = result;
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    it('should return error result for invalid input', () => {
      const schema = new StringGuardian().minLength(3);
      const result = schema.safeParse('hi');

      const [error, data] = result;
      asserts.assert(error instanceof GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const schema = new StringGuardian().minLength(5);

      asserts.assertThrows(
        () => schema.parse('hi'),
        GuardianError,
        'String must be at least 5 characters long',
      );
    });

    it('should support custom error messages', () => {
      const schema = new StringGuardian().minLength(5, 'Too short!');

      asserts.assertThrows(
        () => schema.parse('hi'),
        GuardianError,
        'Too short!',
      );
    });
  });

  describe('metadata handling', () => {
    it('should store and retrieve metadata', () => {
      const metaData = {
        description: 'User name field',
        title: 'Name',
        examples: ['John', 'Jane'],
      };

      const schema = new StringGuardian(undefined, metaData);
      asserts.assertEquals(schema.metaData, metaData);
    });

    it('should allow setting metadata properties via describe()', () => {
      const schema = new StringGuardian().describe({
        description: 'Test description',
        title: 'Test Title',
        examples: ['example1', 'example2'],
      });

      asserts.assertEquals(schema.metaData?.description, 'Test description');
      asserts.assertEquals(schema.metaData?.title, 'Test Title');

      asserts.assertArrayIncludes(schema.metaData?.examples || [], [
        'example1',
        'example2',
      ]);
    });
  });

  describe('character validations', () => {
    it('should validate alpha characters', () => {
      const schema = new StringGuardian().alpha();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('WORLD'), 'WORLD');
      asserts.assertEquals(schema.parse('AbCdEf'), 'AbCdEf');
      asserts.assertThrows(() => schema.parse('hello123'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
      asserts.assertThrows(() => schema.parse('hello!'), GuardianError);
    });

    it('should validate alphanumeric characters', () => {
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

  describe('uuid validations', () => {
    it('should validate UUID format', () => {
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

    it('should validate UUID v1 format', () => {
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

    it('should validate UUID v4 format', () => {
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

  describe('content validations', () => {
    it('should validate contains', () => {
      const schema = new StringGuardian().contains('world');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('world hello'), 'world hello');
      asserts.assertEquals(schema.parse('worldwide'), 'worldwide');
      asserts.assertThrows(() => schema.parse('hello earth'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError);
    });

    it('should validate notContains', () => {
      const schema = new StringGuardian().notContains('bad');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('good morning'), 'good morning');
      asserts.assertThrows(() => schema.parse('bad news'), GuardianError);
      asserts.assertThrows(() => schema.parse('not bad'), GuardianError);
      asserts.assertThrows(() => schema.parse('badger'), GuardianError);
    });

    it('should validate startsWith', () => {
      const schema = new StringGuardian().startsWith('hello');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertThrows(() => schema.parse('hi world'), GuardianError);
      asserts.assertThrows(() => schema.parse('world hello'), GuardianError);
    });

    it('should validate endsWith', () => {
      const schema = new StringGuardian().endsWith('world');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('world'), 'world');
      asserts.assertThrows(() => schema.parse('hello earth'), GuardianError);
      asserts.assertThrows(() => schema.parse('world hello'), GuardianError);
    });

    it('should validate notStartsWith', () => {
      const schema = new StringGuardian().notStartsWith('bad');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('good morning'), 'good morning');
      asserts.assertThrows(() => schema.parse('bad news'), GuardianError);
      asserts.assertThrows(() => schema.parse('badger'), GuardianError);
    });

    it('should validate notEndsWith', () => {
      const schema = new StringGuardian().notEndsWith('bad');

      asserts.assertEquals(schema.parse('hello world'), 'hello world');
      asserts.assertEquals(schema.parse('good morning'), 'good morning');
      asserts.assertThrows(() => schema.parse('news bad'), GuardianError);
      asserts.assertThrows(() => schema.parse('not bad'), GuardianError);
    });

    it('should validate notEmpty', () => {
      const schema = new StringGuardian().notEmpty();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse('a'), 'a');
      asserts.assertThrows(() => schema.parse(''), GuardianError);
      asserts.assertThrows(() => schema.parse('   '), GuardianError);
      asserts.assertThrows(() => schema.parse('\t\n'), GuardianError);
    });
  });

  describe('string transformations', () => {
    it('should strip spaces', () => {
      const schema = new StringGuardian().stripSpaces();

      asserts.assertEquals(schema.parse('hello world'), 'helloworld');
      asserts.assertEquals(schema.parse('  hello  world  '), 'helloworld');
      asserts.assertEquals(schema.parse('a b c d'), 'abcd');
      asserts.assertEquals(schema.parse('nospaces'), 'nospaces');
    });

    it('should replace text', () => {
      const schema = new StringGuardian().replace('world', 'universe');

      asserts.assertEquals(schema.parse('hello world'), 'hello universe');
      asserts.assertEquals(schema.parse('world peace'), 'universe peace');
      asserts.assertEquals(schema.parse('no match'), 'no match');
    });

    it('should replace with regex', () => {
      const schema = new StringGuardian().replace(/\d+/g, 'X');

      asserts.assertEquals(schema.parse('hello123world456'), 'helloXworldX');
      asserts.assertEquals(schema.parse('no numbers'), 'no numbers');
    });

    it('should add prefix', () => {
      const schema = new StringGuardian().prefix('Hello ');

      asserts.assertEquals(schema.parse('world'), 'Hello world');
      asserts.assertEquals(schema.parse(''), 'Hello ');
    });

    it('should add suffix', () => {
      const schema = new StringGuardian().suffix(' world');

      asserts.assertEquals(schema.parse('Hello'), 'Hello world');
      asserts.assertEquals(schema.parse(''), ' world');
    });
  });

  describe('nullable and optional', () => {
    it('should handle nullable strings', () => {
      const schema = new StringGuardian().minLength(3).nullable();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
    });

    it('should handle optional strings', () => {
      const schema = new StringGuardian().minLength(3).optional();

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
    });

    it('should handle optional with default', () => {
      const schema = new StringGuardian().minLength(3).optional('default');

      asserts.assertEquals(schema.parse('hello'), 'hello');
      asserts.assertEquals(schema.parse(undefined), 'default');
      asserts.assertThrows(() => schema.parse('hi'), GuardianError);
    });

    it('should handle nullable and optional separately', () => {
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

    it('should handle nullable().optional() chaining', () => {
      const schema = new StringGuardian().minLength(2).nullable().optional(
        'default',
      );

      asserts.assertEquals(schema.parse('hello'), 'hello'); // valid string
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 'default'); // default used
      asserts.assertThrows(() => schema.parse('x'), GuardianError); // validation still works
    });

    it('should handle optional().nullable() chaining', () => {
      const schema = new StringGuardian().minLength(2).optional('default')
        .nullable();

      asserts.assertEquals(schema.parse('hello'), 'hello'); // valid string
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 'default'); // default used
      asserts.assertThrows(() => schema.parse('x'), GuardianError); // validation still works
    });

    it('should work with transformations', () => {
      const schema = new StringGuardian().trim().toUpperCase().optional();

      asserts.assertEquals(schema.parse('  hello  '), 'HELLO');
      asserts.assertEquals(schema.parse(undefined), undefined);
    });

    it('should work with format validations', () => {
      const schema = new StringGuardian().email().nullable();

      asserts.assertEquals(
        schema.parse('test@example.com'),
        'test@example.com',
      );
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse('invalid-email'), GuardianError);
    });
  });

  describe('chained validations', () => {
    it('should chain multiple validations', () => {
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

    it('should chain validations and transformations', () => {
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

  describe('new validation methods', () => {
    it('phone validation', () => {
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

    it('phone validation with custom pattern', () => {
      const customPattern = /^\d{3}-\d{3}-\d{4}$/;
      const schema = new StringGuardian().phone(customPattern);

      asserts.assertEquals(schema.parse('123-456-7890'), '123-456-7890');
      asserts.assertThrows(() => schema.parse('(123) 456-7890'), GuardianError);
    });

    it('ipAddress validation', () => {
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

    it('ipv4 validation', () => {
      const schema = new StringGuardian().ipv4();

      asserts.assertEquals(schema.parse('192.168.1.1'), '192.168.1.1');
      asserts.assertEquals(schema.parse('127.0.0.1'), '127.0.0.1');
      asserts.assertThrows(() => schema.parse('256.1.1.1'), GuardianError);
      asserts.assertThrows(() => schema.parse('2001:db8::1'), GuardianError);
    });

    it('ipv6 validation', () => {
      const schema = new StringGuardian().ipv6();

      asserts.assertEquals(
        schema.parse('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      );
      asserts.assertThrows(() => schema.parse('192.168.1.1'), GuardianError);
      asserts.assertThrows(() => schema.parse('invalid-ipv6'), GuardianError);
    });

    it('internalIp validation', () => {
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

    it('macAddress validation', () => {
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

    it('creditCard validation', () => {
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

    it('creditCard validation by type', () => {
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

    it('slug validation', () => {
      const schema = new StringGuardian().slug();

      asserts.assertEquals(schema.parse('hello-world'), 'hello-world');
      asserts.assertEquals(schema.parse('test123'), 'test123');
      asserts.assertThrows(() => schema.parse('Hello-World'), GuardianError); // uppercase
      asserts.assertThrows(() => schema.parse('hello_world'), GuardianError); // underscore
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError); // space
    });

    it('hexColor validation', () => {
      const schema = new StringGuardian().hexColor();

      asserts.assertEquals(schema.parse('#fff'), '#fff');
      asserts.assertEquals(schema.parse('#ffffff'), '#ffffff');
      asserts.assertEquals(schema.parse('#123ABC'), '#123ABC');
      asserts.assertThrows(() => schema.parse('fff'), GuardianError); // missing #
      asserts.assertThrows(() => schema.parse('#gggggg'), GuardianError); // invalid hex
    });

    it('domain validation', () => {
      const schema = new StringGuardian().domain();

      asserts.assertEquals(schema.parse('example.com'), 'example.com');
      asserts.assertEquals(schema.parse('sub.example.com'), 'sub.example.com');
      asserts.assertEquals(schema.parse('localhost'), 'localhost');
      asserts.assertThrows(() => schema.parse(''), GuardianError);
      asserts.assertThrows(() => schema.parse('.com'), GuardianError);
    });

    it('noWhitespace validation', () => {
      const schema = new StringGuardian().noWhitespace();

      asserts.assertEquals(schema.parse('helloworld'), 'helloworld');
      asserts.assertEquals(schema.parse('test123'), 'test123');
      asserts.assertThrows(() => schema.parse('hello world'), GuardianError);
      asserts.assertThrows(() => schema.parse('test\t123'), GuardianError);
      asserts.assertThrows(() => schema.parse('test\n123'), GuardianError);
    });

    it('ascii validation', () => {
      const schema = new StringGuardian().ascii();

      asserts.assertEquals(
        schema.parse('Hello World 123!'),
        'Hello World 123!',
      );
      asserts.assertThrows(() => schema.parse('Héllo'), GuardianError); // non-ASCII
      asserts.assertThrows(() => schema.parse('🌍'), GuardianError); // emoji
    });

    it('noSqlInjection validation', () => {
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

    it('noSqlInjection accepts legitimate punctuation-bearing strings', () => {
      // Regression: the old blanket regex rejected ANY apostrophe or
      // hyphen (and any word containing a SQL keyword), so ordinary
      // names, dates, slugs and free text all failed. These must pass.
      const schema = new StringGuardian().noSqlInjection();
      for (
        const good of [
          "O'Brien",
          'Mary O’Brien',
          'well-known',
          '2024-01-01',
          'please select one',
          'north-south',
          'a-b-c',
          'up-to-date pricing',
        ]
      ) {
        asserts.assertEquals(schema.parse(good), good);
      }
    });

    it('noSqlInjection still catches genuine injection payloads', () => {
      const schema = new StringGuardian().noSqlInjection();
      for (
        const bad of [
          "' OR 1=1",
          "admin'--",
          '1; DELETE FROM accounts',
          'UNION ALL SELECT password FROM users',
          "'; DROP TABLE students; --",
        ]
      ) {
        asserts.assertThrows(() => schema.parse(bad), GuardianError);
      }
    });

    it('noXss validation', () => {
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

  describe('new transformation methods', () => {
    it('capitalize transformation', () => {
      const schema = new StringGuardian().capitalize();

      asserts.assertEquals(schema.parse('hello world'), 'Hello World');
      asserts.assertEquals(schema.parse('test case'), 'Test Case');
      asserts.assertEquals(schema.parse('already Correct'), 'Already Correct');
    });

    it('camelCase transformation', () => {
      const schema = new StringGuardian().camelCase();

      asserts.assertEquals(schema.parse('hello world'), 'helloWorld');
      asserts.assertEquals(schema.parse('test-case'), 'testCase');
      asserts.assertEquals(schema.parse('snake_case'), 'snakeCase');
      asserts.assertEquals(schema.parse('Already Correct'), 'alreadyCorrect');
    });

    it('snakeCase transformation', () => {
      const schema = new StringGuardian().snakeCase();

      asserts.assertEquals(schema.parse('hello world'), 'hello_world');
      asserts.assertEquals(schema.parse('testCase'), 'test_case');
      asserts.assertEquals(schema.parse('kebab-case'), 'kebab_case');
      asserts.assertEquals(schema.parse('PascalCase'), 'pascal_case');
    });

    it('kebabCase transformation', () => {
      const schema = new StringGuardian().kebabCase();

      asserts.assertEquals(schema.parse('hello world'), 'hello-world');
      asserts.assertEquals(schema.parse('testCase'), 'test-case');
      asserts.assertEquals(schema.parse('snake_case'), 'snake-case');
      asserts.assertEquals(schema.parse('PascalCase'), 'pascal-case');
    });

    it('pascalCase transformation', () => {
      const schema = new StringGuardian().pascalCase();

      asserts.assertEquals(schema.parse('hello world'), 'HelloWorld');
      asserts.assertEquals(schema.parse('test-case'), 'TestCase');
      asserts.assertEquals(schema.parse('snake_case'), 'SnakeCase');
      asserts.assertEquals(schema.parse('camelCase'), 'Camelcase');
    });

    it('reverse transformation', () => {
      const schema = new StringGuardian().reverse();

      asserts.assertEquals(schema.parse('hello'), 'olleh');
      asserts.assertEquals(schema.parse('world'), 'dlrow');
      asserts.assertEquals(schema.parse('12345'), '54321');
    });

    it('padStart transformation', () => {
      const schema = new StringGuardian().padStart(5, '0');

      asserts.assertEquals(schema.parse('123'), '00123');
      asserts.assertEquals(schema.parse('12345'), '12345');
      asserts.assertEquals(schema.parse('123456'), '123456'); // longer than target
    });

    it('padEnd transformation', () => {
      const schema = new StringGuardian().padEnd(5, '0');

      asserts.assertEquals(schema.parse('123'), '12300');
      asserts.assertEquals(schema.parse('12345'), '12345');
      asserts.assertEquals(schema.parse('123456'), '123456'); // longer than target
    });

    it('sanitize transformation', () => {
      const schema = new StringGuardian().sanitize();

      asserts.assertEquals(schema.parse('normal text'), 'normal text');
      asserts.assertEquals(
        schema.parse("<script>alert('bad')</script>"),
        '&lt;script&gt;alert(&#x27;bad&#x27;)&lt;/script&gt;',
      );
      asserts.assertEquals(
        schema.parse('Hello & <world>'),
        'Hello &amp; &lt;world&gt;',
      );
      asserts.assertEquals(
        schema.parse('onclick="alert(1)"'),
        'onclick=&quot;alert(1)&quot;',
      );
    });

    it('normalizeSpace transformation', () => {
      const schema = new StringGuardian().normalizeSpace();

      asserts.assertEquals(schema.parse('  hello   world  '), 'hello world');
      asserts.assertEquals(schema.parse('test\t\n  spaces'), 'test spaces');
      asserts.assertEquals(schema.parse('already normal'), 'already normal');
    });
  });

  describe('nullable and optional scenarios', () => {
    it('nullable phone validation', () => {
      const schema = new StringGuardian().phone().nullable();

      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse('123-456-7890'), '123-456-7890');
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse('invalid'), GuardianError);
    });

    it('optional creditCard validation', () => {
      const schema = new StringGuardian().creditCard().optional();

      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertEquals(
        schema.parse('4000000000000002'),
        '4000000000000002',
      );
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse('invalid'), GuardianError);
    });

    it('optional with default camelCase', () => {
      const schema = new StringGuardian().camelCase().optional('defaultValue');

      asserts.assertEquals(schema.parse(undefined), 'defaultvalue');
      asserts.assertEquals(schema.parse('hello world'), 'helloWorld');
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Chain immutability', () => {
    it('chain extensions return a fresh instance', () => {
      const guard = new StringGuardian();
      const withProcess = guard.process((val) => val.toUpperCase());

      asserts.assertNotStrictEquals(guard, withProcess);
      asserts.assertEquals(guard.parse('test'), 'test');
      asserts.assertEquals(withProcess.parse('test'), 'TEST');
    });

    it('shared base schemas can branch safely', () => {
      // Regression: under the old mutate-by-default behaviour,
      // deriving Email/Username from NonEmpty would have poisoned
      // NonEmpty. Verifying the source stays untouched.
      const NonEmpty = new StringGuardian().minLength(1);
      const Email = NonEmpty.email();
      const Username = NonEmpty.maxLength(32);

      asserts.assertEquals(NonEmpty.parse('hi'), 'hi'); // still valid
      asserts.assertEquals(Email.parse('a@b.co'), 'a@b.co');
      asserts.assertEquals(Username.parse('abc'), 'abc');
      asserts.assertThrows(() => Email.parse('not-an-email'), GuardianError);
      asserts.assertThrows(
        () => Username.parse('a'.repeat(33)),
        GuardianError,
      );
    });

    it('should preserve constraints across chain steps', () => {
      const guard = new StringGuardian().minLength(3).maxLength(10);

      asserts.assertEquals(guard.parse('test'), 'test');
      asserts.assertThrows(() => guard.parse('ab'), GuardianError);
      asserts.assertThrows(() => guard.parse('verylongstring'), GuardianError);
    });
  });

  describe('Metadata and describe', () => {
    it('should set metadata via describe', () => {
      const guard = new StringGuardian().describe({
        title: 'Name',
        description: 'User full name',
      });

      asserts.assertEquals(guard.metaData?.title, 'Name');
      asserts.assertEquals(guard.metaData?.description, 'User full name');
    });

    it('should not override protected flags with describe', () => {
      const guard = new StringGuardian()
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any,
        });

      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across multiple describe calls', () => {
      const guard = new StringGuardian();

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'String field' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'String field');
    });
  });

  describe('Empty and whitespace strings', () => {
    it('should handle empty strings', () => {
      const guard = new StringGuardian();
      asserts.assertEquals(guard.parse(''), '');
    });

    it('should reject empty strings with minLength', () => {
      const guard = new StringGuardian().minLength(1);
      asserts.assertThrows(() => guard.parse(''), GuardianError);
    });

    it('should handle whitespace-only strings', () => {
      const guard = new StringGuardian();
      asserts.assertEquals(guard.parse('   '), '   ');
    });

    it('should trim whitespace', () => {
      const guard = new StringGuardian().trim();
      asserts.assertEquals(guard.parse('  test  '), 'test');
      asserts.assertEquals(guard.parse('\t\ntest\t\n'), 'test');
    });
  });

  describe('Unicode and special characters', () => {
    it('should handle unicode characters', () => {
      const guard = new StringGuardian();
      asserts.assertEquals(guard.parse('Hello 世界'), 'Hello 世界');
      asserts.assertEquals(guard.parse('🎉🎊'), '🎉🎊');
    });

    it('should handle unicode in length constraints', () => {
      const guard = new StringGuardian().minLength(2).maxLength(5);
      asserts.assertEquals(guard.parse('🎉🎊'), '🎉🎊');
    });

    it('should handle escape sequences', () => {
      const guard = new StringGuardian();
      asserts.assertEquals(guard.parse('Line1\\nLine2'), 'Line1\\nLine2');
      asserts.assertEquals(guard.parse('Tab\\there'), 'Tab\\there');
    });

    it('should handle quotes and special chars', () => {
      const guard = new StringGuardian();
      asserts.assertEquals(guard.parse("He said 'hello'"), "He said 'hello'");
      asserts.assertEquals(guard.parse('She said "hi"'), 'She said "hi"');
    });
  });

  describe('SafeParse comprehensive', () => {
    it('should handle safeParse with valid strings', () => {
      const guard = new StringGuardian();

      const [error, data] = guard.safeParse('test');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'test');
    });

    it('should handle safeParse with invalid strings', () => {
      const guard = new StringGuardian();

      // Coerce-by-default: 123 → '123' is now a success, not an error.
      const [coerceErr, coerceData] = guard.safeParse(123);
      asserts.assertEquals(coerceErr, null);
      asserts.assertEquals(coerceData, '123');

      // Truly non-coercible inputs still surface as errors.
      const [error, data] = guard.safeParse({});
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle safeParse with constraints', () => {
      const guard = new StringGuardian().minLength(5);

      const [error1, data1] = guard.safeParse('hello');
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, 'hello');

      const [error2, data2] = guard.safeParse('hi');
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });

    it('should handle safeParse with transformations', () => {
      const guard = new StringGuardian().toUpperCase();

      const [error, data] = guard.safeParse('test');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'TEST');
    });
  });

  describe('Error scenarios comprehensive', () => {
    it('should reject non-coercible types', () => {
      const guard = new StringGuardian();

      // Coerce-by-default: primitives flow through.
      asserts.assertEquals(guard.parse(123), '123');
      asserts.assertEquals(guard.parse(true), 'true');

      // Objects / arrays / null aren't safely coercible.
      asserts.assertThrows(() => guard.parse({}), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
    });

    it('should provide clear error messages for type errors', () => {
      const guard = new StringGuardian();

      try {
        guard.parse({});
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('string') || error.message.includes('String'),
        );
      }
    });

    it('should provide clear error messages for length violations', () => {
      const guard = new StringGuardian().minLength(5);

      try {
        guard.parse('hi');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('5') || error.message.includes('min'),
        );
      }
    });

    it('should provide clear error messages for pattern violations', () => {
      const guard = new StringGuardian().email();

      try {
        guard.parse('not an email');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('email') || error.message.includes('valid'),
        );
      }
    });
  });

  describe('Async parseAsync comprehensive', () => {
    it('should handle parseAsync with sync operations', async () => {
      const guard = new StringGuardian();

      const result = await guard.parseAsync('test');
      asserts.assertEquals(result, 'test');
    });

    it('should handle parseAsync with async transformations', async () => {
      const guard = new StringGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val.toUpperCase();
      });

      const result = await guard.parseAsync('test');
      asserts.assertEquals(result, 'TEST');
    });

    it('should handle parseAsync errors', async () => {
      const guard = new StringGuardian().minLength(5);

      let caught = false;
      try {
        await guard.parseAsync('hi');
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('OpenAPI generation comprehensive', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = new StringGuardian();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'string');
    });

    it('should include min/maxLength in OpenAPI', () => {
      const guard = new StringGuardian().minLength(3).maxLength(20);
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.minLength, 3);
      asserts.assertEquals(schema.maxLength, 20);
    });

    it('should include pattern in OpenAPI', () => {
      const guard = new StringGuardian().pattern(/^[a-z]+$/);
      const schema = guard.toOpenAPI();

      asserts.assert(schema.pattern);
    });

    it('should include format for email in OpenAPI', () => {
      const guard = new StringGuardian().email();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.format, 'email');
    });

    it('should include metadata in OpenAPI schema', () => {
      const guard = new StringGuardian().describe({
        title: 'Description',
        description: 'Item description',
        default: '',
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.title, 'Description');
      asserts.assertEquals(schema.description, 'Item description');
      asserts.assertEquals(schema.default, '');
    });

    it('should handle nullable in OpenAPI', () => {
      const guard = new StringGuardian().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('Complex transformation chains', () => {
    it('should chain multiple string transformations', () => {
      const guard = new StringGuardian()
        .trim()
        .toLowerCase()
        .process((val) => val.replaceAll(/ /g, '-'));

      asserts.assertEquals(guard.parse('  Hello World  '), 'hello-world');
    });

    it('should handle validation after transformation', () => {
      const guard = new StringGuardian()
        .trim()
        .minLength(5);

      asserts.assertEquals(guard.parse('  hello  '), 'hello');
      asserts.assertThrows(() => guard.parse('  hi  '), GuardianError);
    });
  });

  describe('Very long strings', () => {
    it('should handle very long strings', () => {
      const guard = new StringGuardian();
      const longString = 'a'.repeat(10000);

      asserts.assertEquals(guard.parse(longString), longString);
    });

    it('should validate maxLength on very long strings', () => {
      const guard = new StringGuardian().maxLength(1000);
      const longString = 'a'.repeat(10000);

      asserts.assertThrows(() => guard.parse(longString), GuardianError);
    });
  });

  describe('languageCode', () => {
    it('accepts common BCP 47 forms', () => {
      const guard = new StringGuardian().languageCode();
      for (
        const tag of [
          'en',
          'en-US',
          'zh-Hans',
          'zh-Hans-CN',
          'de-DE-1996',
          'es-419',
          'pt-BR',
        ]
      ) {
        asserts.assertEquals(guard.parse(tag), tag);
      }
    });

    it('rejects malformed tags', () => {
      const guard = new StringGuardian().languageCode();
      for (const tag of ['EN', 'en_US', 'en-us', '123', '']) {
        asserts.assertThrows(
          () => guard.parse(tag),
          GuardianError,
          undefined,
          `should reject ${tag}`,
        );
      }
    });

    it('sets the bcp47 format on the schema', () => {
      const guard = new StringGuardian().languageCode();
      const schema = guard.toOpenAPI();
      asserts.assertEquals(schema.format, 'bcp47');
    });
  });

  describe('latLngString', () => {
    it('accepts well-formed "lat,lng" pairs', () => {
      const guard = new StringGuardian().latLngString();
      asserts.assertEquals(guard.parse('40.7128,-74.0060'), '40.7128,-74.0060');
      asserts.assertEquals(guard.parse('0,0'), '0,0');
      asserts.assertEquals(guard.parse('-90,180'), '-90,180');
    });

    it('tolerates whitespace around the separator', () => {
      const guard = new StringGuardian().latLngString();
      asserts.assertEquals(
        guard.parse('40.7128 , -74.0060'),
        '40.7128,-74.0060',
      );
    });

    it('honours a custom separator', () => {
      const guard = new StringGuardian().latLngString({ separator: '|' });
      asserts.assertEquals(guard.parse('40.7 | -74.0'), '40.7|-74.0');
    });

    it('rejects out-of-range coordinates', () => {
      const guard = new StringGuardian().latLngString();
      asserts.assertThrows(() => guard.parse('91,0'), GuardianError);
      asserts.assertThrows(() => guard.parse('-91,0'), GuardianError);
      asserts.assertThrows(() => guard.parse('0,181'), GuardianError);
      asserts.assertThrows(() => guard.parse('0,-181'), GuardianError);
    });

    it('rejects malformed input', () => {
      const guard = new StringGuardian().latLngString();
      asserts.assertThrows(() => guard.parse('40.7'), GuardianError);
      asserts.assertThrows(() => guard.parse('40.7,'), GuardianError);
      asserts.assertThrows(() => guard.parse(',40.7'), GuardianError);
      asserts.assertThrows(() => guard.parse('not,coords'), GuardianError);
    });
  });

  describe('base58', () => {
    it('accepts the bitcoin alphabet', () => {
      const guard = new StringGuardian().base58();
      // Sample Bitcoin address — alphabet only, no checksum check.
      asserts.assertEquals(
        guard.parse('17Aqf7XknZRsCmWy7q9bqrtMRmTcZAhRy'),
        '17Aqf7XknZRsCmWy7q9bqrtMRmTcZAhRy',
      );
    });

    it('rejects the omitted characters (0, O, I, l)', () => {
      const guard = new StringGuardian().base58();
      asserts.assertThrows(() => guard.parse('0abc'), GuardianError);
      asserts.assertThrows(() => guard.parse('Oabc'), GuardianError);
      asserts.assertThrows(() => guard.parse('Iabc'), GuardianError);
      asserts.assertThrows(() => guard.parse('labc'), GuardianError);
    });
  });

  describe('base32', () => {
    it('accepts RFC 4648 standard alphabet', () => {
      const guard = new StringGuardian().base32();
      asserts.assertEquals(guard.parse('JBSWY3DPEHPK3PXP'), 'JBSWY3DPEHPK3PXP');
      asserts.assertEquals(guard.parse('MZXW6==='), 'MZXW6==='); // with padding
    });

    it('rejects lowercase and digits outside 2-7', () => {
      const guard = new StringGuardian().base32();
      asserts.assertThrows(() => guard.parse('jbswy'), GuardianError); // lowercase
      asserts.assertThrows(() => guard.parse('ABC1'), GuardianError); // `1` not in alphabet
      asserts.assertThrows(() => guard.parse('ABC8'), GuardianError); // `8` not in alphabet
    });
  });

  describe('postalCode (pluggable)', () => {
    it('accepts a US ZIP / ZIP+4 pattern', () => {
      const guard = new StringGuardian().postalCode(/^\d{5}(-\d{4})?$/);
      asserts.assertEquals(guard.parse('94103'), '94103');
      asserts.assertEquals(guard.parse('94103-1234'), '94103-1234');
      asserts.assertThrows(() => guard.parse('9410'), GuardianError);
    });

    it('accepts a UK postcode pattern', () => {
      const guard = new StringGuardian().postalCode(
        /^[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}$/,
      );
      asserts.assertEquals(guard.parse('SW1A 1AA'), 'SW1A 1AA');
      asserts.assertThrows(() => guard.parse('SW1A1AA'), GuardianError);
    });

    it('sets postal-code format on schema', () => {
      const guard = new StringGuardian().postalCode(/^\d{5}$/);
      asserts.assertEquals(guard.toOpenAPI().format, 'postal-code');
    });
  });

  describe('emoji', () => {
    it('accepts strings containing at least one emoji', () => {
      const guard = new StringGuardian().emoji();
      asserts.assertEquals(guard.parse('hello 👋'), 'hello 👋');
      asserts.assertEquals(guard.parse('🎉'), '🎉');
    });

    it('rejects strings without emoji', () => {
      const guard = new StringGuardian().emoji();
      asserts.assertThrows(() => guard.parse('hello world'), GuardianError);
    });

    it('rejects ASCII digits / # / * (not Extended_Pictographic)', () => {
      // `\p{Emoji}` would have matched these (they carry the Emoji
      // property as keycap bases); `\p{Extended_Pictographic}` does not.
      const guard = new StringGuardian().emoji();
      asserts.assertThrows(() => guard.parse('123'), GuardianError);
      asserts.assertThrows(() => guard.parse('#'), GuardianError);
      asserts.assertThrows(() => guard.parse('*'), GuardianError);
      asserts.assertThrows(() => guard.parse('0'), GuardianError);
    });

    it('onlyEmoji rejects strings containing non-emoji chars', () => {
      const guard = new StringGuardian().emoji({ onlyEmoji: true });
      asserts.assertEquals(guard.parse('👋✨'), '👋✨');
      asserts.assertThrows(() => guard.parse('hi 👋'), GuardianError);
    });

    it('onlyEmoji + allowSpaces tolerates whitespace', () => {
      const guard = new StringGuardian().emoji({
        onlyEmoji: true,
        allowSpaces: true,
      });
      asserts.assertEquals(guard.parse('👋 ✨'), '👋 ✨');
      asserts.assertThrows(() => guard.parse('hi 👋'), GuardianError);
    });
  });

  describe('static patterns', () => {
    it('numeric matches real numbers, rejects malformed ones', () => {
      const { numeric } = StringGuardian.patterns;
      // Valid real numbers.
      asserts.assert(numeric.test('123'));
      asserts.assert(numeric.test('1.5'));
      asserts.assert(numeric.test('.5'));
      asserts.assert(numeric.test('0'));
      // Malformed — the old `/^[0-9.]+$/` accepted all of these.
      asserts.assertFalse(numeric.test('1.2.3'));
      asserts.assertFalse(numeric.test('.'));
      asserts.assertFalse(numeric.test('...'));
      asserts.assertFalse(numeric.test(''));
      asserts.assertFalse(numeric.test('abc'));
    });
  });

  describe('encodeUri / decodeUri', () => {
    it('encodeUri percent-encodes the string', () => {
      const guard = new StringGuardian().encodeUri();
      asserts.assertEquals(
        guard.parse('hello world & friends'),
        'hello%20world%20%26%20friends',
      );
    });

    it('decodeUri reverses encodeUri', () => {
      const guard = new StringGuardian().decodeUri();
      asserts.assertEquals(guard.parse('hello%20world'), 'hello world');
    });

    it('decodeUri throws GuardianError on malformed escapes', () => {
      const guard = new StringGuardian().decodeUri();
      const [err] = guard.safeParse('%E0%A4%A');
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertStringIncludes(err.message, 'Cannot decode URI component');
    });

    it('encodeUri / decodeUri round-trip', () => {
      const round = new StringGuardian().encodeUri().decodeUri();
      asserts.assertEquals(round.parse('hello world'), 'hello world');
    });
  });

  describe('jwt', () => {
    it('accepts well-formed JWT (three base64url segments)', () => {
      const guard = new StringGuardian().jwt();
      const sample =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      asserts.assertEquals(guard.parse(sample), sample);
    });

    it('rejects malformed JWT', () => {
      const guard = new StringGuardian().jwt();
      asserts.assertThrows(() => guard.parse('just.two'), GuardianError);
      asserts.assertThrows(() => guard.parse('not-a-jwt'), GuardianError);
    });
  });

  describe('isbn', () => {
    it('accepts ISBN-10 with valid checksum', () => {
      const guard = new StringGuardian().isbn(10);
      // The Hitchhiker's Guide to the Galaxy (sample)
      asserts.assertEquals(guard.parse('0345391802'), '0345391802');
      // X as the last digit (= 10)
      asserts.assertEquals(guard.parse('097522980X'), '097522980X');
    });

    it('accepts ISBN-13 with valid checksum', () => {
      const guard = new StringGuardian().isbn(13);
      asserts.assertEquals(guard.parse('9780345391803'), '9780345391803');
    });

    it('strips hyphens and spaces before checksum validation', () => {
      const guard = new StringGuardian().isbn();
      asserts.assertEquals(guard.parse('0-345-39180-2'), '0-345-39180-2');
    });

    it('rejects wrong checksum', () => {
      const guard = new StringGuardian().isbn();
      asserts.assertThrows(() => guard.parse('0345391800'), GuardianError);
    });

    it('rejects wrong length when version is pinned', () => {
      const guard10 = new StringGuardian().isbn(10);
      asserts.assertThrows(() => guard10.parse('9780345391803'), GuardianError);
    });
  });

  describe('semver', () => {
    it('accepts standard semver versions', () => {
      const guard = new StringGuardian().semver();
      asserts.assertEquals(guard.parse('1.2.3'), '1.2.3');
      asserts.assertEquals(guard.parse('1.0.0-beta.1'), '1.0.0-beta.1');
      asserts.assertEquals(guard.parse('2.0.0+build.123'), '2.0.0+build.123');
    });

    it('rejects malformed versions', () => {
      const guard = new StringGuardian().semver();
      asserts.assertThrows(() => guard.parse('1.2'), GuardianError);
      asserts.assertThrows(() => guard.parse('v1.2.3'), GuardianError);
    });

    it('allowPrerelease: false rejects pre-release versions', () => {
      const guard = new StringGuardian().semver({ allowPrerelease: false });
      asserts.assertEquals(guard.parse('1.2.3'), '1.2.3');
      asserts.assertThrows(() => guard.parse('1.2.3-rc.1'), GuardianError);
    });
  });

  describe('mimeType', () => {
    it('accepts well-formed MIME types', () => {
      const guard = new StringGuardian().mimeType();
      asserts.assertEquals(guard.parse('application/json'), 'application/json');
      asserts.assertEquals(
        guard.parse('text/html; charset=utf-8'),
        'text/html; charset=utf-8',
      );
    });

    it('rejects malformed types', () => {
      const guard = new StringGuardian().mimeType();
      asserts.assertThrows(() => guard.parse('text'), GuardianError);
      asserts.assertThrows(() => guard.parse('/json'), GuardianError);
    });

    it('honours an allow-list', () => {
      const guard = new StringGuardian().mimeType(['image/png', 'image/jpeg']);
      asserts.assertEquals(guard.parse('image/png'), 'image/png');
      asserts.assertThrows(
        () => guard.parse('application/json'),
        GuardianError,
      );
    });
  });

  describe('countryCode', () => {
    it('accepts ISO 3166 alpha-2 by default', () => {
      const guard = new StringGuardian().countryCode();
      asserts.assertEquals(guard.parse('US'), 'US');
      asserts.assertEquals(guard.parse('GB'), 'GB');
      asserts.assertThrows(() => guard.parse('USA'), GuardianError);
      asserts.assertThrows(() => guard.parse('us'), GuardianError);
    });

    it('accepts alpha-3 when requested', () => {
      const guard = new StringGuardian().countryCode('alpha-3');
      asserts.assertEquals(guard.parse('USA'), 'USA');
      asserts.assertThrows(() => guard.parse('US'), GuardianError);
    });

    it('accepts numeric when requested', () => {
      const guard = new StringGuardian().countryCode('numeric');
      asserts.assertEquals(guard.parse('840'), '840');
      asserts.assertThrows(() => guard.parse('84'), GuardianError);
    });
  });

  describe('currencyCode', () => {
    it('accepts three uppercase letters', () => {
      const guard = new StringGuardian().currencyCode();
      asserts.assertEquals(guard.parse('USD'), 'USD');
      asserts.assertEquals(guard.parse('JPY'), 'JPY');
    });

    it('rejects lowercase or wrong length', () => {
      const guard = new StringGuardian().currencyCode();
      asserts.assertThrows(() => guard.parse('usd'), GuardianError);
      asserts.assertThrows(() => guard.parse('US'), GuardianError);
      asserts.assertThrows(() => guard.parse('USDD'), GuardianError);
    });
  });

  describe('ulid / cuid / cuid2', () => {
    it('ulid accepts 26-char Crockford base32', () => {
      const guard = new StringGuardian().ulid();
      asserts.assertEquals(
        guard.parse('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      );
      // Case-insensitive
      asserts.assertEquals(
        guard.parse('01arz3ndektsv4rrffq69g5fav'),
        '01arz3ndektsv4rrffq69g5fav',
      );
      asserts.assertThrows(
        () => guard.parse('01ARZ3NDEKTSV4RRFFQ69G5FA'),
        GuardianError,
      );
    });

    it('cuid accepts c-prefixed 25 chars', () => {
      const guard = new StringGuardian().cuid();
      asserts.assertEquals(
        guard.parse('clrwk6yt40001qz2ek6f7r2t1'),
        'clrwk6yt40001qz2ek6f7r2t1',
      );
      asserts.assertThrows(
        () => guard.parse('xlrwk6yt40001qz2ek6f7r2t1'),
        GuardianError,
      );
    });

    it('cuid2 accepts letter-prefixed alphanumeric (default 24 chars)', () => {
      const guard = new StringGuardian().cuid2();
      asserts.assertEquals(
        guard.parse('k3rj9xn8q1p7m2w5y6h4t8d9'),
        'k3rj9xn8q1p7m2w5y6h4t8d9',
      );
      asserts.assertThrows(
        () => guard.parse('1abcdefghijklmnopqrstuvwxyz'),
        GuardianError,
      );
    });

    it('cuid2 honours custom length', () => {
      const guard = new StringGuardian().cuid2({ length: 32 });
      const id = 'k' + 'a'.repeat(31);
      asserts.assertEquals(guard.parse(id), id);
      asserts.assertThrows(
        () => guard.parse('k' + 'a'.repeat(23)),
        GuardianError,
      );
    });
  });

  describe('password', () => {
    it('default policy: 8+ chars with upper/lower/digit', () => {
      const guard = new StringGuardian().password();
      asserts.assertEquals(guard.parse('Abcdef12'), 'Abcdef12');
      asserts.assertThrows(() => guard.parse('short'), GuardianError);
      asserts.assertThrows(() => guard.parse('alllowercase1'), GuardianError);
      asserts.assertThrows(() => guard.parse('ALLUPPERCASE1'), GuardianError);
      asserts.assertThrows(() => guard.parse('NoDigitsHere'), GuardianError);
    });

    it('requireSymbol enforces non-alphanumeric chars', () => {
      const guard = new StringGuardian().password({ requireSymbol: true });
      asserts.assertEquals(guard.parse('Ab12cdef!'), 'Ab12cdef!');
      asserts.assertThrows(() => guard.parse('Ab12cdef'), GuardianError);
    });

    it('maxConsecutive caps identical-character runs', () => {
      const guard = new StringGuardian().password({ maxConsecutive: 2 });
      asserts.assertEquals(guard.parse('Aaab1234'), 'Aaab1234');
      asserts.assertThrows(() => guard.parse('Aaaab123'), GuardianError);
    });

    it('forbidCommonPasswords rejects the built-in list', () => {
      const guard = new StringGuardian().password({
        forbidCommonPasswords: true,
        requireUpper: false,
        requireLower: false,
        requireDigit: false,
        minLength: 1,
      });
      asserts.assertThrows(() => guard.parse('password'), GuardianError);
      asserts.assertThrows(() => guard.parse('PASSWORD'), GuardianError); // case-insensitive
    });

    it('does not leak the plaintext password when the error is serialized', () => {
      // Regression: the rejected credential was stored in
      // `context.got` and echoed verbatim by `toJSON()` — any app that
      // logged the error object leaked the plaintext password.
      const secret = 'short';
      const [err] = new StringGuardian()
        .password({ minLength: 12 })
        .safeParse(secret);
      asserts.assertInstanceOf(err, GuardianError);
      asserts.assertEquals(JSON.stringify(err).includes(secret), false);
      asserts.assertEquals(
        JSON.stringify(err.toJSON()).includes(secret),
        false,
      );
    });
  });

  describe('toBigInt', () => {
    it('parses decimal strings', () => {
      const guard = new StringGuardian().toBigInt();
      asserts.assertEquals(guard.parse('12345'), 12345n);
    });

    it('parses hex strings with { hex: true }', () => {
      const guard = new StringGuardian().toBigInt({ hex: true });
      asserts.assertEquals(guard.parse('0xdeadbeef'), 0xdeadbeefn);
      asserts.assertEquals(guard.parse('ff'), 0xffn);
    });

    it('throws on malformed input', () => {
      const guard = new StringGuardian().toBigInt();
      asserts.assertThrows(() => guard.parse('not a number'), GuardianError);
    });
  });

  describe('json', () => {
    it('passes valid JSON through unchanged', () => {
      const guard = new StringGuardian().json();
      asserts.assertEquals(guard.parse('{"a":1}'), '{"a":1}');
      asserts.assertEquals(guard.parse('[1,2,3]'), '[1,2,3]');
    });

    it('throws on malformed JSON', () => {
      const guard = new StringGuardian().json();
      asserts.assertThrows(() => guard.parse('{bad json}'), GuardianError);
    });
  });

  describe('hex / base64', () => {
    it('hex accepts hex strings', () => {
      const guard = new StringGuardian().hex();
      asserts.assertEquals(guard.parse('deadBEEF'), 'deadBEEF');
      asserts.assertThrows(() => guard.parse('xyz'), GuardianError);
    });

    it('hex with length enforces exact chars', () => {
      const guard = new StringGuardian().hex({ length: 8 });
      asserts.assertEquals(guard.parse('deadbeef'), 'deadbeef');
      asserts.assertThrows(() => guard.parse('dead'), GuardianError);
    });

    it('hex with prefix: "0x" requires the prefix', () => {
      const guard = new StringGuardian().hex({ prefix: '0x' });
      asserts.assertEquals(guard.parse('0xdeadbeef'), '0xdeadbeef');
      asserts.assertThrows(() => guard.parse('deadbeef'), GuardianError);
    });

    it('base64 accepts standard alphabet', () => {
      const guard = new StringGuardian().base64();
      asserts.assertEquals(guard.parse('aGVsbG8='), 'aGVsbG8=');
      asserts.assertThrows(() => guard.parse('aGVsbG8-'), GuardianError); // dash not in standard
    });

    it('base64 { urlSafe: true } accepts url-safe variant', () => {
      const guard = new StringGuardian().base64({ urlSafe: true });
      // Same body as standard, but url-safe-allowed chars (`-` and
      // `_`) replace `+` and `/`. Length 8 satisfies the padding
      // check.
      asserts.assertEquals(guard.parse('aGVsbG8-'), 'aGVsbG8-');
      asserts.assertEquals(guard.parse('aGVsbG8_'), 'aGVsbG8_');
    });
  });
});

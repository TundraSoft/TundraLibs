import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { StringGuardian } from '../../guards/mod.ts';

Deno.test('StringGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through string values', () => {
      const guard = StringGuardian.create();
      assertEquals(guard('hello'), 'hello');
      assertEquals(guard(''), '');
    });

    await t.step('throws for non-string values', () => {
      const guard = StringGuardian.create();
      assertThrows(
        () => guard(123),
        GuardianError,
        'Expected value to be a string, got number',
      );
      assertThrows(
        () => guard(true),
        GuardianError,
        'Expected value to be a string, got boolean',
      );
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected value to be a string, got object',
      );
      assertThrows(
        () => guard([]),
        GuardianError,
        'Expected value to be a string, got array',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected value to be a string, got null',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected value to be a string, got undefined',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = StringGuardian.create('Custom error');
      assertThrows(() => guard(123), Error, 'Custom error');
    });
  });

  // Transformation tests
  await t.step('transformations', async (t) => {
    await t.step('upperCase', () => {
      const guard = StringGuardian.create().upperCase();
      assertEquals(guard('hello'), 'HELLO');
      assertEquals(guard('Mixed CASE'), 'MIXED CASE');
    });

    await t.step('lowerCase', () => {
      const guard = StringGuardian.create().lowerCase();
      assertEquals(guard('HELLO'), 'hello');
      assertEquals(guard('Mixed CASE'), 'mixed case');
    });

    await t.step('trim', () => {
      const guard = StringGuardian.create().trim();
      assertEquals(guard('  hello  '), 'hello');
      assertEquals(guard('\t\nhello world\n\t'), 'hello world');
    });

    await t.step('stripSpaces', () => {
      const guard = StringGuardian.create().stripSpaces();
      assertEquals(guard('hello world'), 'helloworld');
      assertEquals(guard('  spaced  text  '), 'spacedtext');
    });

    await t.step('replace', () => {
      const guard = StringGuardian.create().replace('hello', 'hi');
      assertEquals(guard('hello world'), 'hi world');

      const regexGuard = StringGuardian.create().replace(/[aeiou]/g, '*');
      assertEquals(regexGuard('hello world'), 'h*ll* w*rld');
    });

    await t.step('slice', () => {
      const guard = StringGuardian.create().slice(0, 5);
      assertEquals(guard('hello world'), 'hello');

      const endGuard = StringGuardian.create().slice(6);
      assertEquals(endGuard('hello world'), 'world');
    });

    await t.step('prefix', () => {
      const guard = StringGuardian.create().prefix('pre-');
      assertEquals(guard('fix'), 'pre-fix');
    });

    await t.step('suffix', () => {
      const guard = StringGuardian.create().suffix('-end');
      assertEquals(guard('front'), 'front-end');
    });

    await t.step('chaining transformations', () => {
      const guard = StringGuardian.create()
        .trim()
        .upperCase()
        .replace(' ', '-');
      assertEquals(guard('  hello world  '), 'HELLO-WORLD');
    });
  });

  // Validation tests
  await t.step('validations', async (t) => {
    await t.step('minLength', async (t) => {
      await t.step('passes when string length is sufficient', () => {
        const guard = StringGuardian.create().minLength(5);
        assertEquals(guard('hello'), 'hello');
        assertEquals(guard('hello world'), 'hello world');
      });

      await t.step('throws when string is too short', () => {
        const guard = StringGuardian.create().minLength(5);
        assertThrows(
          () => guard('hi'),
          Error,
          'Expected value must be at least 5 characters long',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = StringGuardian.create().minLength(5, 'String too short');
        assertThrows(() => guard('hi'), Error, 'String too short');
      });
    });

    await t.step('maxLength', async (t) => {
      await t.step('passes when string length is within limit', () => {
        const guard = StringGuardian.create().maxLength(5);
        assertEquals(guard('hello'), 'hello');
        assertEquals(guard('hi'), 'hi');
      });

      await t.step('throws when string is too long', () => {
        const guard = StringGuardian.create().maxLength(5);
        assertThrows(
          () => guard('hello world'),
          Error,
          'Expected value must be at most 5 characters long',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = StringGuardian.create().maxLength(5, 'String too long');
        assertThrows(() => guard('hello world'), Error, 'String too long');
      });
    });

    await t.step('pattern', async (t) => {
      await t.step('passes when string matches pattern', () => {
        const guard = StringGuardian.create().pattern(/^[a-z]+$/);
        assertEquals(guard('hello'), 'hello');
      });

      await t.step('throws when string does not match pattern', () => {
        const guard = StringGuardian.create().pattern(/^[a-z]+$/);
        assertThrows(
          () => guard('Hello123'),
          Error,
          'Expected value to match pattern /^[a-z]+$/',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = StringGuardian.create().pattern(
          /^[a-z]+$/,
          'Only lowercase letters allowed',
        );
        assertThrows(
          () => guard('Hello123'),
          Error,
          'Only lowercase letters allowed',
        );
      });
    });

    await t.step('email', async (t) => {
      await t.step('passes for valid email addresses', () => {
        const guard = StringGuardian.create().email();
        assertEquals(guard('test@example.com'), 'test@example.com');
        assertEquals(
          guard('name.surname@domain.co.uk'),
          'name.surname@domain.co.uk',
        );
      });

      await t.step('throws for invalid email addresses', () => {
        const guard = StringGuardian.create().email();
        assertThrows(
          () => guard('notanemail'),
          Error,
          'Expected value (notanemail) to be a valid email',
        );
        assertThrows(
          () => guard('missing@tld'),
          Error,
          'Expected value (missing@tld) to be a valid email',
        );
        assertThrows(
          () => guard('@missing.com'),
          Error,
          'Expected value (@missing.com) to be a valid email',
        );
      });
    });

    await t.step('notEmpty', async (t) => {
      await t.step('passes for non-empty strings', () => {
        const guard = StringGuardian.create().notEmpty();
        assertEquals(guard('hello'), 'hello');
        assertThrows(
          () => guard(' '),
          GuardianError,
          'Expected value to not be empty',
        );
      });

      await t.step('throws for empty strings', () => {
        const guard = StringGuardian.create().notEmpty();
        assertThrows(() => guard(''), Error, 'Expected value to not be empty');
      });

      await t.step('uses custom error message when provided', () => {
        const guard = StringGuardian.create().notEmpty(
          'Empty string not allowed',
        );
        assertThrows(() => guard(''), Error, 'Empty string not allowed');
      });
    });

    await t.step('url', async (t) => {
      await t.step('passes for valid URLs', () => {
        const guard = StringGuardian.create().url();
        assertEquals(guard('https://example.com'), 'https://example.com');
        assertEquals(guard('http://localhost:8080'), 'http://localhost:8080');
      });

      await t.step('throws for invalid URLs', () => {
        const guard = StringGuardian.create().url();
        assertThrows(
          () => guard('example.com'),
          Error,
          'Expected value (example.com) to be a valid URL',
        );
        assertThrows(
          () => guard('not a url'),
          Error,
          'Expected value (not a url) to be a valid URL',
        );
      });
    });

    await t.step('alpha', async (t) => {
      await t.step('passes for alphabetic strings', () => {
        const guard = StringGuardian.create().alpha();
        assertEquals(guard('hello'), 'hello');
        assertEquals(guard('HELLO'), 'HELLO');
      });

      await t.step('throws for non-alphabetic strings', () => {
        const guard = StringGuardian.create().alpha();
        assertThrows(
          () => guard('hello123'),
          Error,
          'Expected value (hello123) to contain only alphabets',
        );
        assertThrows(
          () => guard('hello world'),
          Error,
          'Expected value (hello world) to contain only alphabets',
        );
      });
    });

    await t.step('alphanumeric', async (t) => {
      await t.step('passes for alphanumeric strings', () => {
        const guard = StringGuardian.create().alphanumeric();
        assertEquals(guard('hello123'), 'hello123');
        assertEquals(guard('HELLO456'), 'HELLO456');
      });

      await t.step('throws for non-alphanumeric strings', () => {
        const guard = StringGuardian.create().alphanumeric();
        assertThrows(
          () => guard('hello_123'),
          Error,
          'Expected value (hello_123) to contain only alphanumeric characters',
        );
        assertThrows(
          () => guard('hello world'),
          Error,
          'Expected value (hello world) to contain only alphanumeric characters',
        );
      });
    });

    await t.step('numeric', async (t) => {
      await t.step('passes for numeric strings', () => {
        const guard = StringGuardian.create().numeric();
        assertEquals(guard('123'), '123');
        assertEquals(guard('456789'), '456789');
      });

      await t.step('throws for non-numeric strings', () => {
        const guard = StringGuardian.create().numeric();
        assertThrows(
          () => guard('123abc'),
          Error,
          'Expected value (123abc) to contain only numbers',
        );
        assertEquals(guard('123.45'), '123.45');
      });
    });

    await t.step('uuid', async (t) => {
      await t.step('passes for valid UUIDs', () => {
        const guard = StringGuardian.create().uuid();
        assertEquals(
          guard('123e4567-e89b-12d3-a456-426614174000'),
          '123e4567-e89b-12d3-a456-426614174000',
        );
      });

      await t.step('throws for invalid UUIDs', () => {
        const guard = StringGuardian.create().uuid();
        assertThrows(
          () => guard('not-a-uuid'),
          Error,
          'Expected value (not-a-uuid) to be a valid UUID',
        );
        assertThrows(
          () => guard('123e4567-e89b-12d3-a456'),
          Error,
          'Expected value (123e4567-e89b-12d3-a456) to be a valid UUID',
        );
      });
    });

    await t.step('ipv4', async (t) => {
      await t.step('passes for valid IPv4 addresses', () => {
        const guard = StringGuardian.create().ipv4();
        assertEquals(guard('192.168.1.1'), '192.168.1.1');
        assertEquals(guard('127.0.0.1'), '127.0.0.1');
      });

      await t.step('throws for invalid IPv4 addresses', () => {
        const guard = StringGuardian.create().ipv4();
        assertThrows(
          () => guard('256.0.0.1'),
          Error,
          'Expected value (256.0.0.1) to be an IPv4 address',
        );
        assertThrows(
          () => guard('192.168.1'),
          Error,
          'Expected value (192.168.1) to be an IPv4 address',
        );
        assertThrows(
          () => guard('192.168.1.1.1'),
          Error,
          'Expected value (192.168.1.1.1) to be an IPv4 address',
        );
      });
    });

    await t.step('ipv6', async (t) => {
      await t.step('passes for valid IPv6 addresses', () => {
        const guard = StringGuardian.create().ipv6();
        assertEquals(
          guard('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
          '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        );
        assertEquals(guard('::1'), '::1');
      });

      await t.step('throws for invalid IPv6 addresses', () => {
        const guard = StringGuardian.create().ipv6();
        assertThrows(
          () => guard('192.168.1.1'),
          Error,
          'Expected value (192.168.1.1) to be an IPv6 address',
        );
        assertThrows(
          () => guard('2001:0db8:85a3:0000:0000:8a2e:0370:7334:extra'),
          Error,
          'Expected value (2001:0db8:85a3:0000:0000:8a2e:0370:7334:extra) to be an IPv6 address',
        );
      });
    });

    await t.step('contains', async (t) => {
      await t.step('passes when string contains substring', () => {
        const guard = StringGuardian.create().contains('world');
        assertEquals(guard('hello world'), 'hello world');
      });

      await t.step('throws when string does not contain substring', () => {
        const guard = StringGuardian.create().contains('universe');
        assertThrows(
          () => guard('hello world'),
          Error,
          'Expected value (hello world) to contain universe',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = StringGuardian.create().contains(
          'universe',
          'Missing required text',
        );
        assertThrows(
          () => guard('hello world'),
          Error,
          'Missing required text',
        );
      });
    });

    await t.step('startsWith', async (t) => {
      await t.step('passes when string starts with prefix', () => {
        const guard = StringGuardian.create().startsWith('hello');
        assertEquals(guard('hello world'), 'hello world');
      });

      await t.step('throws when string does not start with prefix', () => {
        const guard = StringGuardian.create().startsWith('world');
        assertThrows(
          () => guard('hello world'),
          Error,
          'Expected value (hello world) to start with world',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = StringGuardian.create().startsWith(
          'world',
          'Wrong prefix',
        );
        assertThrows(() => guard('hello world'), Error, 'Wrong prefix');
      });
    });

    await t.step('endsWith', async (t) => {
      await t.step('passes when string ends with suffix', () => {
        const guard = StringGuardian.create().endsWith('world');
        assertEquals(guard('hello world'), 'hello world');
      });

      await t.step('throws when string does not end with suffix', () => {
        const guard = StringGuardian.create().endsWith('hello');
        assertThrows(
          () => guard('hello world'),
          Error,
          'Expected value (hello world) to end with hello',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = StringGuardian.create().endsWith('hello', 'Wrong suffix');
        assertThrows(() => guard('hello world'), Error, 'Wrong suffix');
      });
    });

    await t.step('chaining validations', () => {
      const guard = StringGuardian.create()
        .minLength(5)
        .maxLength(10)
        .alphanumeric();

      assertEquals(guard('hello123'), 'hello123');
      assertThrows(
        () => guard('hi'),
        Error,
        'Expected value must be at least 5 characters long',
      );
      assertThrows(
        () => guard('helloworld123'),
        Error,
        'Expected value must be at most 10 characters long',
      );
      assertThrows(
        () => guard('hello_123'),
        Error,
        'Expected value (hello_123) to contain only alphanumeric characters',
      );
    });
  });
});

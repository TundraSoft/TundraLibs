import { GuardianError, stringGuard } from '../mod.ts';

import {
  assertEquals,
  assertInstanceOf,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Guardian', () => {
  describe('String', () => {
    it({
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

    it({
      name: 'String - Check if correct error message is coming',
      fn(): void {
        assertThrows(
          () =>
            stringGuard.aadhaar('Value is not a valid AADHAAR')('123456789'),
          GuardianError,
          'Value is not a valid AADHAAR',
        );
      },
    });

    it({
      name: 'StringGuardian - Test capitalize',
      fn(): void {
        assertEquals(stringGuard.capitalize()('hello'), 'Hello');
        assertEquals(stringGuard.capitalize()('world'), 'World');
        assertEquals(stringGuard.capitalize()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test lowerCase',
      fn(): void {
        assertEquals(stringGuard.lowerCase()('Hello'), 'hello');
        assertEquals(stringGuard.lowerCase()('WORLD'), 'world');
        assertEquals(stringGuard.lowerCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test upperCase',
      fn(): void {
        assertEquals(stringGuard.upperCase()('hello'), 'HELLO');
        assertEquals(stringGuard.upperCase()('world'), 'WORLD');
        assertEquals(stringGuard.upperCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test camelCase',
      fn(): void {
        assertEquals(stringGuard.camelCase()('hello world'), 'HelloWorld');
        assertEquals(stringGuard.camelCase()('foo bar'), 'FooBar');
        assertEquals(stringGuard.camelCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test snakeCase',
      fn(): void {
        assertEquals(stringGuard.snakeCase()('hello world'), 'hello_world');
        assertEquals(stringGuard.snakeCase()('foo bar'), 'foo_bar');
        assertEquals(stringGuard.snakeCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test trim',
      fn(): void {
        assertEquals(stringGuard.trim()('  hello  '), 'hello');
        assertEquals(stringGuard.trim()('  world  '), 'world');
        assertEquals(stringGuard.trim()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test replace',
      fn(): void {
        assertEquals(
          stringGuard.replace('hello', 'hi')('hello world'),
          'hi world',
        );
        assertEquals(stringGuard.replace('foo', 'bar')('foo bar'), 'bar bar');
        assertEquals(stringGuard.replace('abc', 'def')(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test toDate',
      fn(): void {
        // Add your test cases here
        assertInstanceOf(stringGuard.toDate('yyyy-MM-dd')('2020-01-01'), Date);
      },
    });

    it({
      name: 'StringGuardian - Test notEmpty',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.notEmpty()('hello'), 'hello');
        assertEquals(stringGuard.notEmpty()(' '), ' ');
        assertThrows(() => stringGuard.notEmpty()(''), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test min',
      fn(): void {
        // Add your test cases here
        assertThrows(() => stringGuard.min(5)('hi'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test max',
      fn(): void {
        // Add your test cases here
        assertThrows(() => stringGuard.max(5)('hello world'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test between',
      fn(): void {
        // Add your test cases here
        assertThrows(
          () => stringGuard.between(2, 5)('hello world'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test pattern',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.pattern(/^[0-9]+$/)('12345'), '12345');
      },
    });

    it({
      name: 'StringGuardian - Test pan',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.pan()('ABCDE1234F'), 'ABCDE1234F');
        assertThrows(() => stringGuard.pan()('ABCDE1234'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test aadhaar',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.aadhaar()('2234 5678 9012'), '2234 5678 9012');
        assertThrows(() => stringGuard.aadhaar()('123456789'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test email',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.email()('test@email.com'), 'test@email.com');
        assertThrows(() => stringGuard.email()('testemail.com'), GuardianError);
        assertThrows(() => stringGuard.email()('test@email'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test mobile',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.mobile()('6937483910'), '6937483910');
        assertThrows(() => stringGuard.mobile()('123456789'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test phone',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.phone()('1234567890'), '1234567890');
        assertThrows(() => stringGuard.phone()('0123456789'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test ifsc',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.ifsc()('SBIN0000003'), 'SBIN0000003');
        assertEquals(stringGuard.ifsc()('SBIN00000A3'), 'SBIN00000A3');
        assertThrows(() => stringGuard.ifsc()('SBIN_01'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test gst',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.gst()('29AABCU9602H1Z0'), '29AABCU9602H1Z0');
        // assertThrows(() => stringGuard.gst()('29AABCU9602H1Z'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test ipv4',
      fn(): void {
        // Add your test cases here
        assertEquals(stringGuard.ipv4()('192.168.1.1'), '192.168.1.1');
        assertThrows(
          () => stringGuard.ipv4()('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test ipv6',
      fn(): void {
        // Add your test cases here
        assertEquals(
          stringGuard.ipv6()('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
          '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        );
        assertThrows(
          () => stringGuard.ipv6()('2001:0db8:85a3:0000:0000:8a2e:0370'),
          GuardianError,
        );
        assertThrows(() => stringGuard.ipv6()('192.168.1.1'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test url',
      fn(): void {
        // Add your test cases here
        assertEquals(
          stringGuard.url()('https://www.google.com'),
          'https://www.google.com',
        );
        assertThrows(() => stringGuard.url()('d:/a/dsf'), GuardianError);
      },
    });
  });
});

import { Guardian, GuardianError } from '../mod.ts';

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
        assertEquals(Guardian.string().trim().between(3, 40)('John '), 'John');
        assertEquals(
          Guardian.string().trim().between(3, 40).email().equals(
            'test@email.com',
          )('test@email.com'),
          'test@email.com',
        );
        const a = Guardian.string().trim().between(3, 40).email(
          'Invalid email',
        );
        const [e, _d] = a.validate('some');
        assertInstanceOf(e, GuardianError);
        // Check message
        assertEquals(e.message, 'Invalid email');
        assertEquals(e.children, []);
      },
    });

    it({
      name: 'String - Test basic string validation',
      fn(): void {
        assertEquals(
          Guardian.string().trim().between(3, 40)('Abhinav '),
          'Abhinav',
        );
        assertEquals(
          Guardian.string().trim().between(3, 40).email()('testmail@gmail.com'),
          'testmail@gmail.com',
        );
        assertEquals(Guardian.string()(' asd sd asd asd '), ' asd sd asd asd ');
        assertEquals(Guardian.string().optional()(), undefined);
        assertThrows(
          () => Guardian.string().aadhaar()('123456789'),
          GuardianError,
        );
      },
    });

    it({
      name: 'String - Check if correct error message is coming',
      fn(): void {
        assertThrows(
          () =>
            Guardian.string().aadhaar('Value is not a valid AADHAAR')(
              '123456789',
            ),
          GuardianError,
          'Value is not a valid AADHAAR',
        );
      },
    });

    it({
      name: 'StringGuardian - Test capitalize',
      fn(): void {
        assertEquals(Guardian.string().capitalize()('hello'), 'Hello');
        assertEquals(Guardian.string().capitalize()('world'), 'World');
        assertEquals(Guardian.string().capitalize()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test lowerCase',
      fn(): void {
        assertEquals(Guardian.string().lowerCase()('Hello'), 'hello');
        assertEquals(Guardian.string().lowerCase()('WORLD'), 'world');
        assertEquals(Guardian.string().lowerCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test upperCase',
      fn(): void {
        assertEquals(Guardian.string().upperCase()('hello'), 'HELLO');
        assertEquals(Guardian.string().upperCase()('world'), 'WORLD');
        assertEquals(Guardian.string().upperCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test camelCase',
      fn(): void {
        assertEquals(
          Guardian.string().camelCase()('hello world'),
          'HelloWorld',
        );
        assertEquals(Guardian.string().camelCase()('foo bar'), 'FooBar');
        assertEquals(Guardian.string().camelCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test snakeCase',
      fn(): void {
        assertEquals(
          Guardian.string().snakeCase()('hello world'),
          'hello_world',
        );
        assertEquals(Guardian.string().snakeCase()('foo bar'), 'foo_bar');
        assertEquals(Guardian.string().snakeCase()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test trim',
      fn(): void {
        assertEquals(Guardian.string().trim()('  hello  '), 'hello');
        assertEquals(Guardian.string().trim()('  world  '), 'world');
        assertEquals(Guardian.string().trim()(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test replace',
      fn(): void {
        assertEquals(
          Guardian.string().replace('hello', 'hi')('hello world'),
          'hi world',
        );
        assertEquals(
          Guardian.string().replace('foo', 'bar')('foo bar'),
          'bar bar',
        );
        assertEquals(Guardian.string().replace('abc', 'def')(''), '');
      },
    });

    it({
      name: 'StringGuardian - Test toDate',
      fn(): void {
        // Add your test cases here
        assertInstanceOf(
          Guardian.string().toDate('yyyy-MM-dd')('2020-01-01'),
          Date,
        );
      },
    });

    it({
      name: 'StringGuardian - Test notEmpty',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().notEmpty()('hello'), 'hello');
        assertEquals(Guardian.string().notEmpty()(' '), ' ');
        assertThrows(() => Guardian.string().notEmpty()(''), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test min',
      fn(): void {
        // Add your test cases here
        assertThrows(() => Guardian.string().min(5)('hi'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test max',
      fn(): void {
        // Add your test cases here
        assertThrows(
          () => Guardian.string().max(5)('hello world'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test between',
      fn(): void {
        // Add your test cases here
        assertThrows(
          () => Guardian.string().between(2, 5)('hello world'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test pattern',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().pattern(/^[0-9]+$/)('12345'), '12345');
      },
    });

    it({
      name: 'StringGuardian - Test pan',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().pan()('ABCDE1234F'), 'ABCDE1234F');
        assertThrows(() => Guardian.string().pan()('ABCDE1234'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test aadhaar',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().aadhaar()('2234 5678 9012'),
          '2234 5678 9012',
        );
        assertThrows(
          () => Guardian.string().aadhaar()('123456789'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test email',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().email()('test@email.com'),
          'test@email.com',
        );
        assertThrows(
          () => Guardian.string().email()('testemail.com'),
          GuardianError,
        );
        assertThrows(
          () => Guardian.string().email()('test@email'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test mobile',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().mobile()('6937483910'), '6937483910');
        assertThrows(
          () => Guardian.string().mobile()('123456789'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test phone',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().phone()('1234567890'), '1234567890');
        assertThrows(
          () => Guardian.string().phone()('0123456789'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test ifsc',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().ifsc()('SBIN0000003'), 'SBIN0000003');
        assertEquals(Guardian.string().ifsc()('SBIN00000A3'), 'SBIN00000A3');
        assertThrows(() => Guardian.string().ifsc()('SBIN_01'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test gst',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().gst()('29AABCU9602H1Z0'),
          '29AABCU9602H1Z0',
        );
        // assertThrows(() => Guardian.string().gst()('29AABCU9602H1Z'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test ipv4',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().ipv4()('192.168.1.1'), '192.168.1.1');
        assertThrows(
          () =>
            Guardian.string().ipv4()('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test ipv6',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().ipv6()('2001:0db8:85a3:0000:0000:8a2e:0370:7334'),
          '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        );
        assertThrows(
          () => Guardian.string().ipv6()('2001:0db8:85a3:0000:0000:8a2e:0370'),
          GuardianError,
        );
        assertThrows(
          () => Guardian.string().ipv6()('192.168.1.1'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test domain',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().domain()('www.google.com'),
          'www.google.com',
        );
        assertThrows(
          () => Guardian.string().domain()('d:/a/dsf'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test hostname',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().hostName()('www.google.com'),
          'www.google.com',
        );
        assertThrows(
          () => Guardian.string().hostName()('d:/a/dsf'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test url',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().url()('https://www.google.com'),
          'https://www.google.com',
        );
        assertThrows(() => Guardian.string().url()('d:/a/dsf'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test uuid',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().uuid()('550e8400-e29b-41d4-a716-446655440000'),
          '550e8400-e29b-41d4-a716-446655440000',
        );
        assertThrows(
          () => Guardian.string().uuid()('550e8400-e29b-41d4-a716-44665544000'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test creditCard',
      fn(): void {
        // Add your test cases here
        assertEquals(
          Guardian.string().card()('4111111111111111'),
          '4111111111111111',
        );
        assertThrows(
          () => Guardian.string().card()('411111111111111'),
          GuardianError,
        );
        // Visa
        assertEquals(
          Guardian.string().visa()('4111111111111111'),
          '4111111111111111',
        );

        // Mastercard
        assertEquals(
          Guardian.string().mastercard()('5555555555554444'),
          '5555555555554444',
        );

        // amex
        assertEquals(
          Guardian.string().amex()('378282246310005'),
          '378282246310005',
        );

        // discover
        assertEquals(
          Guardian.string().discover()('6011111111111117'),
          '6011111111111117',
        );

        // diners
        assertEquals(
          Guardian.string().diners()('30569309025904'),
          '30569309025904',
        );

        // jcb
        assertEquals(
          Guardian.string().jcb()('3530111333300000'),
          '3530111333300000',
        );

        // rupay
        assertEquals(
          Guardian.string().rupay()('6521030000000000'),
          '6521030000000000',
        );
      },
    });

    it({
      name: 'StringGuardian - Test CVV',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().cvv()('123'), '123');
        assertThrows(() => Guardian.string().cvv()('12'), GuardianError);
      },
    });

    it({
      name: 'StringGuardian - Test UPIId',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().upiId()('test@upi'), 'test@upi');
        assertThrows(
          () => Guardian.string().upiId()('test@upi@'),
          GuardianError,
        );
      },
    });

    it({
      name: 'StringGuardian - Test pinCode',
      fn(): void {
        // Add your test cases here
        assertEquals(Guardian.string().pinCode()('560004'), '560004');
        assertThrows(() => Guardian.string().pinCode()('56004'), GuardianError);
      },
    });
  });
});

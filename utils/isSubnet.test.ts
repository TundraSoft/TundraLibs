import { assertEquals } from '$asserts';
import { isSubnet } from './isSubnet.ts';

Deno.test('utils.isSubnet', async (t) => {
  await t.step('IPv4 valid subnets', () => {
    const validSubnets = [
      '192.168.0.0/24',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '0.0.0.0/0',
      '255.255.255.255/32',
      '192.168.1.0/16',
    ];

    validSubnets.forEach((subnet) => {
      assertEquals(isSubnet(subnet), true, `Expected ${subnet} to be valid`);
    });
  });

  await t.step('IPv4 invalid subnets', () => {
    const invalidSubnets = [
      '192.168.0.256/24', // Invalid IP
      '192.168.0.0/33', // Invalid subnet
      '192.168.0/-1', // Invalid subnet
      '192.168.0.1', // Missing subnet
      '192.168.0.1/', // Empty subnet
      '192.168.0.1/invalid', // Non-numeric subnet
      '192.168/24', // Incomplete IP
      '192.168.0.0.0/24', // Too many segments
      '192.168.01.1/24', // Leading zeros
    ];

    invalidSubnets.forEach((subnet) => {
      assertEquals(isSubnet(subnet), false, `Expected ${subnet} to be invalid`);
    });
  });

  await t.step('IPv6 valid subnets', () => {
    const validSubnets = [
      '2001:db8::/32',
      'fe80::/10',
      '::1/128',
      '::/0',
      '2001:db8:85a3::8a2e:370:7334/64',
      'fe80::1:2:3:4/64',
      '2001:db8::/48',
    ];

    validSubnets.forEach((subnet) => {
      assertEquals(isSubnet(subnet), true, `Expected ${subnet} to be valid`);
    });
  });

  await t.step('IPv6 invalid subnets', () => {
    const invalidSubnets = [
      '2001:db8::/129', // Invalid subnet
      '2001:db8::/256', // Invalid subnet
      '2001:db8::-1', // Invalid subnet format
      '2001:db8::', // Missing subnet
      '2001:db8::/', // Empty subnet
      '2001:db8::/invalid', // Non-numeric subnet
      '2001:db8:::1/64', // Invalid compression
      '2001:db8::g000/64', // Invalid hex
      '2001:db8::1::2/64', // Multiple compression
      '2001:db8:1:2:3:4:5:6:7/64', // Too many segments
    ];

    invalidSubnets.forEach((subnet) => {
      assertEquals(isSubnet(subnet), false, `Expected ${subnet} to be invalid`);
    });
  });

  await t.step('Input validation', () => {
    const invalidInputs = [
      '', // Empty string
      ' ', // Whitespace
      'invalid', // Invalid format
      '192.168.1.1/24/', // Extra slash
      undefined, // undefined
      null, // null
      {}, // object
      [], // array
      true, // boolean
      123, // number
    ];

    invalidInputs.forEach((input) => {
      // @ts-ignore: Testing invalid inputs
      assertEquals(isSubnet(input), false, `Expected ${input} to be invalid`);
    });
  });

  await t.step('Whitespace handling', () => {
    assertEquals(
      isSubnet('  192.168.0.0/24  '),
      true,
      'Should handle surrounding whitespace',
    );
    assertEquals(
      isSubnet('2001:db8::1/64 '),
      true,
      'Should handle trailing whitespace',
    );
    assertEquals(
      isSubnet(' fe80::/10'),
      true,
      'Should handle leading whitespace',
    );
  });
});

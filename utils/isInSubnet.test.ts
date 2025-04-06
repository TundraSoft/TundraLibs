import * as asserts from '$asserts';
import { isInSubnet } from './isInSubnet.ts';

Deno.test('utils.isInSubnet', async (t) => {
  await t.step('IPv4 - should handle valid subnets', () => {
    const tests = [
      { ip: '192.168.0.10', subnet: '192.168.0.0/24', expected: true },
      { ip: '192.168.1.10', subnet: '192.168.0.0/24', expected: false },
      { ip: '192.168.0.10', subnet: '192.168.0.0/16', expected: true },
      { ip: '192.168.0.10', subnet: '192.168.0.10/32', expected: true },
      { ip: '10.0.0.1', subnet: '10.0.0.0/8', expected: true },
      { ip: '11.0.0.1', subnet: '10.0.0.0/8', expected: false },
    ];

    for (const { ip, subnet, expected } of tests) {
      asserts.assertEquals(
        isInSubnet(ip, subnet),
        expected,
        `${ip} in ${subnet} should be ${expected}`,
      );
    }
  });

  await t.step('IPv4 - should handle boundary cases', () => {
    // Testing specific boundary cases
    asserts.assertEquals(
      isInSubnet('192.168.0.0', '192.168.0.0/24'),
      true,
      'Network address should be in subnet',
    );

    asserts.assertEquals(
      isInSubnet('192.168.0.255', '192.168.0.0/24'),
      true,
      'Broadcast address should be in subnet',
    );

    asserts.assertEquals(
      isInSubnet('192.168.1.0', '192.168.0.0/24'),
      false,
      'Next network address should not be in subnet',
    );

    // Edge case: /0 subnet (the entire internet)
    asserts.assertEquals(
      isInSubnet('1.2.3.4', '0.0.0.0/0'),
      true,
      'Any IPv4 should be in a /0 subnet',
    );

    // Edge case: /32 subnet (single host)
    asserts.assertEquals(
      isInSubnet('1.2.3.4', '1.2.3.4/32'),
      true,
      'Exact match with /32 should be true',
    );

    asserts.assertEquals(
      isInSubnet('1.2.3.5', '1.2.3.4/32'),
      false,
      'Different IP with /32 should be false',
    );
  });

  await t.step('IPv6 - should handle valid subnets', () => {
    const tests = [
      { ip: '2001:db8::1', subnet: '2001:db8::/32', expected: true },
      { ip: '2001:db8::1', subnet: '2001:db9::/32', expected: false },
      { ip: 'fe80::1234:5678', subnet: 'fe80::/10', expected: true },
      { ip: 'fe80::1', subnet: 'fe80::1/128', expected: true },
      {
        ip: '2001:db8:1:2:3:4:5:6',
        subnet: '2001:db8:1:2::/64',
        expected: true,
      },
      {
        ip: '2001:db8:2:2:3:4:5:6',
        subnet: '2001:db8:1:2::/64',
        expected: false,
      },
    ];

    for (const { ip, subnet, expected } of tests) {
      asserts.assertEquals(
        isInSubnet(ip, subnet),
        expected,
        `${ip} in ${subnet} should be ${expected}`,
      );
    }
  });

  await t.step('IPv6 - should handle compressed notation', () => {
    // Test IPv6 addresses in different notation forms
    asserts.assertEquals(
      isInSubnet('2001:db8::1', '2001:db8::/32'),
      true,
      'Compressed IPv6 notation should work',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8:0:0:0:0:0:1', '2001:db8::/32'),
      true,
      'Full IPv6 notation should work',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8::1', '2001:db8:0:0:0:0:0:0/32'),
      true,
      'Mixed notation should work',
    );
  });

  await t.step('IPv6 - should handle boundary cases', () => {
    // Testing specific boundary cases for IPv6
    asserts.assertEquals(
      isInSubnet('2001:db8::', '2001:db8::/64'),
      true,
      'Network address should be in subnet',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8::ffff:ffff:ffff:ffff', '2001:db8::/64'),
      true,
      'Last address in subnet should be in subnet',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8:0:1::', '2001:db8::/64'),
      false,
      'Next network address should not be in subnet',
    );

    // Edge case: /0 subnet (the entire internet)
    asserts.assertEquals(
      isInSubnet('2001:db8::1', '::/0'),
      true,
      'Any IPv6 should be in a /0 subnet',
    );

    // Edge case: /128 subnet (single host)
    asserts.assertEquals(
      isInSubnet('2001:db8::1', '2001:db8::1/128'),
      true,
      'Exact match with /128 should be true',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8::2', '2001:db8::1/128'),
      false,
      'Different IP with /128 should be false',
    );
  });

  await t.step('should handle mixed IP versions', () => {
    // IPv4 and IPv6 should not match each other
    asserts.assertEquals(
      isInSubnet('192.168.0.1', '2001:db8::/32'),
      false,
      'IPv4 should not match IPv6 subnet',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8::1', '192.168.0.0/24'),
      false,
      'IPv6 should not match IPv4 subnet',
    );
  });

  await t.step('should handle invalid inputs', () => {
    const invalidTests = [
      { ip: '', subnet: '192.168.0.0/24' },
      { ip: '192.168.0.1', subnet: '' },
      { ip: '192.168.0.1', subnet: '192.168.0.0' }, // Missing mask
      { ip: '192.168.0.1', subnet: '192.168.0.0/33' }, // Invalid mask
      { ip: '2001:db8::1', subnet: '2001:db8/64' }, // Invalid IPv6 subnet
      { ip: '2001:xyz::1', subnet: '2001:db8::/64' }, // Invalid IPv6 address
      { ip: '192.168.0.256', subnet: '192.168.0.0/24' }, // Invalid IPv4 address
      { ip: '192.168.0.1', subnet: '192.168.0.0/invalid' }, // Invalid CIDR
      { ip: undefined, subnet: '192.168.0.0/24' }, // Undefined IP
      { ip: '192.168.0.1', subnet: undefined }, // Undefined subnet
      { ip: null, subnet: '192.168.0.0/24' }, // Null IP
      { ip: '192.168.0.1', subnet: null }, // Null subnet
      { ip: {}, subnet: '192.168.0.0/24' }, // Object as IP
      { ip: '192.168.0.1', subnet: {} }, // Object as subnet
      { ip: '192.168.0.1', subnet: '192.168.0.0/-1' }, // Negative CIDR
    ];

    for (const { ip, subnet } of invalidTests) {
      asserts.assertEquals(
        // @ts-ignore - Testing invalid inputs
        isInSubnet(ip, subnet),
        false,
        `Invalid input ${ip} ${subnet} should return false`,
      );
    }
  });

  await t.step('should handle whitespace in inputs', () => {
    asserts.assertEquals(
      isInSubnet(' 192.168.0.1 ', ' 192.168.0.0/24 '),
      true,
      'Should trim whitespace from inputs',
    );
  });

  await t.step('IPv4 - should handle non-standard CIDR notations', () => {
    // Test with /31 (2 addresses), /30 (4 addresses) networks
    asserts.assertEquals(
      isInSubnet('192.168.0.0', '192.168.0.0/31'),
      true,
      'First address in /31 should be in subnet',
    );

    asserts.assertEquals(
      isInSubnet('192.168.0.1', '192.168.0.0/31'),
      true,
      'Second address in /31 should be in subnet',
    );

    asserts.assertEquals(
      isInSubnet('192.168.0.2', '192.168.0.0/31'),
      false,
      'Address outside /31 should not be in subnet',
    );

    asserts.assertEquals(
      isInSubnet('192.168.0.3', '192.168.0.0/30'),
      true,
      'Last address in /30 should be in subnet',
    );
  });

  await t.step('IPv6 - should handle IPv4-mapped IPv6 addresses', () => {
    asserts.assertEquals(
      isInSubnet('::ffff:192.168.0.1', '::ffff:192.168.0.0/120'),
      true,
      'IPv4-mapped IPv6 should match appropriate subnet',
    );

    asserts.assertEquals(
      isInSubnet('::ffff:192.168.0.1', '::ffff:192.168.1.0/120'),
      false,
      'IPv4-mapped IPv6 should not match different subnet',
    );

    asserts.assertEquals(
      isInSubnet('::ffff:192.168.0.1', '192.168.0.0/24'),
      false,
      'IPv4-mapped IPv6 should not match IPv4 subnet',
    );
  });

  await t.step('IPv6 - should handle special address types', () => {
    // Link-local addresses (fe80::/10)
    asserts.assertEquals(
      isInSubnet('fe80::1:2:3:4', 'fe80::/10'),
      true,
      'Link-local address should match fe80::/10',
    );

    // Unique local addresses (fc00::/7)
    asserts.assertEquals(
      isInSubnet('fd00::1', 'fc00::/7'),
      true,
      'Unique local address should match fc00::/7',
    );

    // Multicast addresses (ff00::/8)
    asserts.assertEquals(
      isInSubnet('ff02::1', 'ff00::/8'),
      true,
      'Multicast address should match ff00::/8',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8::1', 'fe80::/10'),
      false,
      'Global unicast should not match link-local range',
    );
  });

  await t.step('should handle unusual prefix lengths', () => {
    // IPv4 unusual prefixes
    asserts.assertEquals(
      isInSubnet('10.1.1.1', '10.0.0.0/7'),
      true,
      'Should handle unusual IPv4 prefix like /7',
    );

    // IPv6 unusual prefixes
    asserts.assertEquals(
      isInSubnet('2001:db8::1', '2001:db8::/127'),
      true,
      'Should handle unusual IPv6 prefix like /127',
    );

    asserts.assertEquals(
      isInSubnet('2001:db8::3', '2001:db8::/127'),
      false,
      'IPv6 with /127 should only match 2 addresses',
    );
  });

  await t.step('should handle malformed but similar inputs', () => {
    // CIDR with space
    asserts.assertEquals(
      isInSubnet('192.168.0.1', '192.168.0.0 /24'),
      false,
      'CIDR with space should be invalid',
    );

    // Missing segments
    asserts.assertEquals(
      isInSubnet('192.168.0', '192.168.0.0/24'),
      false,
      'IPv4 with missing segments should be invalid',
    );

    // Extra segments
    asserts.assertEquals(
      isInSubnet('192.168.0.1.5', '192.168.0.0/24'),
      false,
      'IPv4 with extra segments should be invalid',
    );

    // Hexadecimal IPv4
    asserts.assertEquals(
      isInSubnet('0xC0.0xA8.0x0.0x1', '192.168.0.0/24'),
      false,
      'Hexadecimal IPv4 should be invalid',
    );
  });
});

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
});

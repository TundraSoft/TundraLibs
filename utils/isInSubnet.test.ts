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

  await t.step('IPv6 - should handle valid subnets', () => {
    const tests = [
      { ip: '2001:db8::1', subnet: '2001:db8::/32', expected: true },
      { ip: '2001:db8::1', subnet: '2001:db9::/32', expected: false },
      { ip: 'fe80::1234:5678', subnet: 'fe80::/10', expected: true },
      { ip: 'fe80::1', subnet: 'fe80::1/128', expected: true },
    ];

    for (const { ip, subnet, expected } of tests) {
      asserts.assertEquals(
        isInSubnet(ip, subnet),
        expected,
        `${ip} in ${subnet} should be ${expected}`,
      );
    }
  });

  await t.step('should handle invalid inputs', () => {
    const invalidTests = [
      { ip: '', subnet: '192.168.0.0/24' },
      { ip: '192.168.0.1', subnet: '' },
      { ip: '192.168.0.1', subnet: '192.168.0.0' }, // Missing mask
      { ip: '192.168.0.1', subnet: '192.168.0.0/33' }, // Invalid mask
      { ip: '2001:db8::1', subnet: '2001:db8/64' }, // Invalid IPv6 subnet
      { ip: '2001:xyz::1', subnet: '2001:db8::/64' }, // Invalid IPv6 address
    ];

    for (const { ip, subnet } of invalidTests) {
      asserts.assertEquals(
        isInSubnet(ip, subnet),
        false,
        `Invalid input ${ip} ${subnet} should return false`,
      );
    }
  });
});

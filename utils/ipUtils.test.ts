import * as asserts from '$asserts';
import {
  expandIPv6,
  ipv4ToBinary,
  ipv4ToHexSegments,
  ipv4ToLong,
  ipv6ToBinary,
  isIPv4InRange,
  isValidIPv4,
  isValidIPv6Structure,
} from './ipUtils.ts';

Deno.test('utils.ipUtils', async (i) => {
  await i.step('isValidIPv4', async (t) => {
    await t.step('should return true for valid IPv4 addresses', () => {
      const validIPs = [
        '192.168.0.1',
        '10.0.0.1',
        '0.0.0.0',
        '255.255.255.255',
        '1.2.3.4',
      ];

      for (const ip of validIPs) {
        asserts.assertEquals(
          isValidIPv4(ip),
          true,
          `Expected ${ip} to be valid`,
        );
      }
    });

    await t.step('should return false for invalid IPv4 addresses', () => {
      const invalidIPs = [
        '192.168.0',
        '192.168.0.1.5',
        '192.168.0.256',
        '192.168.-1.1',
        '192.168.0a.1',
        '',
        'not an ip',
        '192.168.0.1/24', // CIDR not allowed
      ];

      for (const ip of invalidIPs) {
        asserts.assertEquals(
          isValidIPv4(ip),
          false,
          `Expected ${ip} to be invalid`,
        );
      }
    });
  });

  await i.step('isValidIPv6Structure', async (t) => {
    await t.step('should return true for valid IPv6 addresses', () => {
      const validIPs = [
        '2001:db8::1',
        '::1',
        'fe80::1',
        'fe80::1:2:3:4:5',
        '2001:db8:0:0:0:0:0:1',
        'fe80:0:0:0:0:0:0:1',
        '::ffff:192.168.0.1', // IPv4-mapped
        '::192.168.0.1', // IPv4-compatible
      ];

      for (const ip of validIPs) {
        asserts.assertEquals(
          isValidIPv6Structure(ip),
          true,
          `Expected ${ip} to be valid`,
        );
      }
    });

    await t.step('should return false for invalid IPv6 addresses', () => {
      const invalidIPs = [
        '2001:db8', // incomplete
        '2001::db8::1', // multiple ::
        '2001:db8:::1', // invalid compression
        'g001:db8::1', // invalid hex
        '2001:db8::1:2:3:4:5:6:7', // too many segments
        '2001:db8::1:2:3:4:5:6:7:8', // too many segments
        '', // empty string
        'not an ip',
        '2001:db8::1/64', // CIDR not allowed
        '::ffff:192.168.0.256', // invalid IPv4 part
      ];

      for (const ip of invalidIPs) {
        asserts.assertEquals(
          isValidIPv6Structure(ip),
          false,
          `Expected ${ip} to be invalid`,
        );
      }
    });
  });

  await i.step('expandIPv6', async (t) => {
    await t.step('should expand compressed IPv6 addresses', () => {
      const testCases = [
        {
          compressed: '2001:db8::1',
          expanded: '2001:db8:0:0:0:0:0:1',
        },
        {
          compressed: '::1',
          expanded: '0:0:0:0:0:0:0:1',
        },
        {
          compressed: '::',
          expanded: '0:0:0:0:0:0:0:0',
        },
        {
          compressed: '2001::',
          expanded: '2001:0:0:0:0:0:0:0',
        },
        {
          compressed: '::ffff:192.168.0.1',
          expanded: '0:0:0:0:0:ffff:c0a8:1',
        },
        {
          compressed: '::192.168.0.1',
          expanded: '0:0:0:0:0:0:c0a8:1',
        },
        {
          compressed: '1:2:3::4:5',
          expanded: '1:2:3:0:0:0:4:5',
        },
      ];

      for (const { compressed, expanded } of testCases) {
        asserts.assertEquals(
          expandIPv6(compressed),
          expanded,
          `Failed to expand ${compressed}`,
        );
      }
    });

    await t.step('should return null for invalid IPv6 addresses', () => {
      const invalidIPs = [
        '',
        '2001:db8', // incomplete
        '2001::db8::1', // multiple ::
        'g001:db8::1', // invalid hex
        '2001:db8::1:2:3:4:5:6:7', // too many segments
        '::ffff:192.168.0.256', // invalid IPv4 part
      ];

      for (const ip of invalidIPs) {
        asserts.assertEquals(
          expandIPv6(ip),
          null,
          `Expected null for invalid IP ${ip}`,
        );
      }
    });
  });

  await i.step('ipv4ToBinary', async (t) => {
    await t.step('should convert IPv4 to binary correctly', () => {
      const testCases = [
        {
          ip: '192.168.0.1',
          binary: '11000000101010000000000000000001',
        },
        {
          ip: '10.0.0.1',
          binary: '00001010000000000000000000000001',
        },
        {
          ip: '255.255.255.255',
          binary: '11111111111111111111111111111111',
        },
        {
          ip: '0.0.0.0',
          binary: '00000000000000000000000000000000',
        },
      ];

      for (const { ip, binary } of testCases) {
        asserts.assertEquals(
          ipv4ToBinary(ip),
          binary,
          `Failed to convert ${ip} to binary`,
        );
      }
    });
  });

  await i.step('ipv6ToBinary', async (t) => {
    await t.step('should convert IPv6 to binary correctly', () => {
      // We'll verify the length and some basic properties
      // since full binary string is too large to write out
      const testIPs = [
        '2001:db8::1',
        '::1',
        'fe80::1',
        '::ffff:192.168.0.1',
      ];

      for (const ip of testIPs) {
        const binary = ipv6ToBinary(ip);
        asserts.assertEquals(
          binary.length,
          128,
          `Binary representation of ${ip} should be 128 bits`,
        );
        asserts.assert(
          binary.match(/^[01]+$/),
          `Binary representation should only contain 0s and 1s`,
        );
      }

      // Test specific value for ::1 (loopback)
      const loopbackBinary = ipv6ToBinary('::1');
      asserts.assert(
        loopbackBinary.endsWith('1'),
        'Loopback address should end with 1',
      );
      asserts.assert(
        loopbackBinary.startsWith('0'.repeat(127)),
        'Loopback should start with 127 zeros',
      );
    });

    await t.step('should throw for invalid IPv6 addresses', () => {
      const invalidIPs = [
        '',
        '2001:db8', // incomplete
        '2001::db8::1', // multiple ::
      ];

      for (const ip of invalidIPs) {
        asserts.assertThrows(
          () => ipv6ToBinary(ip),
          Error,
          undefined,
          `Should throw for invalid IP ${ip}`,
        );
      }
    });
  });

  await i.step('ipv4ToLong', async (t) => {
    await t.step('should convert IPv4 to long integer correctly', () => {
      const testCases = [
        { ip: '0.0.0.0', expected: 0 },
        { ip: '0.0.0.1', expected: 1 },
        { ip: '0.0.1.0', expected: 256 },
        { ip: '0.1.0.0', expected: 65536 },
        { ip: '1.0.0.0', expected: 16777216 },
        { ip: '192.168.0.1', expected: 3232235521 },
        { ip: '255.255.255.255', expected: 4294967295 },
      ];

      for (const { ip, expected } of testCases) {
        asserts.assertEquals(
          ipv4ToLong(ip),
          expected,
          `Failed to convert ${ip} to long`,
        );
      }
    });
  });

  await i.step('isIPv4InRange', async (t) => {
    await t.step('should correctly detect IP in range', () => {
      const testCases = [
        {
          ip: '192.168.0.5',
          rangeStart: '192.168.0.0',
          cidr: 24,
          expected: true,
        },
        {
          ip: '192.168.1.5',
          rangeStart: '192.168.0.0',
          cidr: 24,
          expected: false,
        },
        {
          ip: '192.168.1.5',
          rangeStart: '192.168.0.0',
          cidr: 16,
          expected: true,
        },
        {
          ip: '10.0.0.5',
          rangeStart: '10.0.0.0',
          cidr: 8,
          expected: true,
        },
        {
          ip: '11.0.0.5',
          rangeStart: '10.0.0.0',
          cidr: 8,
          expected: false,
        },
        {
          ip: '192.168.0.1',
          rangeStart: '192.168.0.1',
          cidr: 32,
          expected: true,
        },
        {
          ip: '192.168.0.2',
          rangeStart: '192.168.0.1',
          cidr: 32,
          expected: false,
        },
      ];

      for (const { ip, rangeStart, cidr, expected } of testCases) {
        asserts.assertEquals(
          isIPv4InRange(ip, rangeStart, cidr),
          expected,
          `Failed for IP ${ip} in range ${rangeStart}/${cidr}`,
        );
      }
    });
  });

  await i.step('ipv4ToHexSegments', async (t) => {
    await t.step('should convert IPv4 to hex segments correctly', () => {
      const testCases = [
        {
          ip: '192.168.0.1',
          hex: ['c0a8', '1'],
        },
        {
          ip: '10.0.0.1',
          hex: ['a00', '1'],
        },
        {
          ip: '255.255.255.255',
          hex: ['ffff', 'ffff'],
        },
        {
          ip: '0.0.0.0',
          hex: ['0', '0'],
        },
      ];

      for (const { ip, hex } of testCases) {
        asserts.assertEquals(
          ipv4ToHexSegments(ip),
          hex,
          `Failed to convert ${ip} to hex segments`,
        );
      }
    });
  });
});

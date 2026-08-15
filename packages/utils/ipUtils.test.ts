import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
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

describe('utils.ipUtils', () => {
  describe('isValidIPv4', () => {
    it('should return true for valid IPv4 addresses', () => {
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

    it('should return false for invalid IPv4 addresses', () => {
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

  describe('isValidIPv6Structure', () => {
    it('should return true for valid IPv6 addresses', () => {
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

    it('should return false for invalid IPv6 addresses', () => {
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
        '2001:::db8', // triple colon (invalid sequence)
        '2001::::1', // quadruple colon (invalid sequence)
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

  describe('expandIPv6', () => {
    it('should expand compressed IPv6 addresses', () => {
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

    it('should return null for invalid IPv6 addresses', () => {
      const invalidIPs = [
        '',
        '2001:db8', // incomplete
        '2001::db8::1', // multiple ::
        'g001:db8::1', // invalid hex
        '2001:db8::1:2:3:4:5:6:7', // too many segments
        '::ffff:192.168.0.256', // invalid IPv4 part
        '2001:::db8', // triple colon (invalid sequence)
        '2001::::1', // quadruple colon (invalid sequence)
        '1:2:3:4:5:6:7:8:9', // too many segments for full notation
        '1a2b:3c4d:xyz::1', // invalid hex character
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

  describe('expandIPv6 IPv4-mapped formats', () => {
    it('should handle various IPv4-mapped IPv6 formats', () => {
      const testCases = [
        {
          compressed: '::ffff:192.168.0.1',
          expanded: '0:0:0:0:0:ffff:c0a8:1',
        },
        {
          compressed: '::192.168.0.1', // IPv4-compatible format
          expanded: '0:0:0:0:0:0:c0a8:1',
        },
        {
          compressed: '2001:db8::192.168.0.1', // mixed with prefix
          expanded: '2001:db8:0:0:0:0:c0a8:1',
        },
        {
          compressed: '2001:db8:1:2::192.168.0.1', // longer prefix
          expanded: '2001:db8:1:2:0:0:c0a8:1',
        },
        {
          compressed: '2001:0:0:0:0:0:192.168.0.1', // full notation with IPv4
          expanded: '2001:0:0:0:0:0:c0a8:1',
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

    it('should return null for invalid mixed formats', () => {
      const invalidCases = [
        '2001:db8:1:2:3:4:5:6:192.168.0.1', // way too many segments (9 total)
        '1:2:3:4:5:6:7:192.168.0.1', // 8 segments including IPv4 mapped (invalid)
        '2001:db8:1:2:3:4:5:192.168.0.1', // 7 segments + IPv4 part (should be max 6)
        ':ffff:192.168.0.1', // leading single colon is not valid IPv6 (round-3 #6)
        ':192.168.0.1', // leading single colon, IPv4-compatible (round-3 #6)
        '192.168.1.1', // bare IPv4 is not IPv6 (round-3 #6)
      ];

      for (const ip of invalidCases) {
        asserts.assertEquals(
          expandIPv6(ip),
          null,
          `Expected null for invalid mixed format ${ip}`,
        );
      }
    });
  });

  describe('ipv4ToBinary', () => {
    it('should convert IPv4 to binary correctly', () => {
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

  describe('ipv6ToBinary', () => {
    it('should convert IPv6 to binary correctly', () => {
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
          /^[01]+$/.exec(binary),
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

    it('should throw for invalid IPv6 addresses', () => {
      const invalidIPs = [
        '',
        '2001:db8', // incomplete
        '2001::db8::1', // multiple ::
        '2001:::db8', // invalid colon sequence
        'xyz::1', // invalid hex
        '1:2:3:4:5:6:7:8:9', // too many segments
        '::ffff:999.168.0.1', // invalid IPv4 part in IPv4-mapped format
      ];

      for (const ip of invalidIPs) {
        asserts.assertThrows(
          () => ipv6ToBinary(ip),
          Error,
          `Invalid IPv6 address: ${ip}`,
          `Should throw for invalid IP ${ip}`,
        );
      }
    });
  });

  describe('ipv4ToLong', () => {
    it('should convert IPv4 to long integer correctly', () => {
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

  describe('isIPv4InRange', () => {
    it('should correctly detect IP in range', () => {
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
        // /0 matches every address (regression: mask was -1, matched nothing)
        {
          ip: '8.8.8.8',
          rangeStart: '0.0.0.0',
          cidr: 0,
          expected: true,
        },
        {
          ip: '255.255.255.255',
          rangeStart: '0.0.0.0',
          cidr: 0,
          expected: true,
        },
        {
          ip: '0.0.0.0',
          rangeStart: '0.0.0.0',
          cidr: 0,
          expected: true,
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

  describe('ipv4ToHexSegments', () => {
    it('should convert IPv4 to hex segments correctly', () => {
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

  // Additional edge and error case coverage for remaining utility functions
  describe('additional edge cases', () => {
    it('ipv4ToHexSegments should throw on invalid IPv4', () => {
      asserts.assertThrows(
        () => ipv4ToHexSegments('256.0.0.1'),
        Error,
        'Invalid IPv4 address: 256.0.0.1',
      );
      asserts.assertThrows(
        () => ipv4ToHexSegments('1.2.3'),
        Error,
        'Invalid IPv4 address: 1.2.3',
      );
    });

    it('isValidIPv4 should allow leading zeros', () => {
      asserts.assertEquals(isValidIPv4('001.002.003.004'), true);
      asserts.assertEquals(isValidIPv4('000.000.000.000'), true);
    });

    it('isValidIPv6Structure negative cases not yet covered', () => {
      // Missing colon entirely
      asserts.assertEquals(isValidIPv6Structure('abcdef0123456789'), false);
      // Excessive length (>45 chars)
      const longIPv6 = '1'.repeat(46) + '::';
      asserts.assertEquals(isValidIPv6Structure(longIPv6), false);
    });

    it('isValidIPv6Structure rejects hex groups longer than 4 digits', () => {
      // Each group must be 1–4 hex digits; length===8 alone is not enough.
      asserts.assertEquals(
        isValidIPv6Structure('12345:1:2:3:4:5:6:7'),
        false,
      );
      // Same check must apply on the compressed path.
      asserts.assertEquals(isValidIPv6Structure('12345::1'), false);
      // A well-formed compressed address still passes.
      asserts.assertEquals(isValidIPv6Structure('fe80::1'), true);
    });

    it(
      'ipv4ToBinary and ipv4ToLong should throw on invalid input',
      () => {
        asserts.assertThrows(
          () => ipv4ToBinary('300.1.1.1'),
          Error,
          'Invalid IPv4 address: 300.1.1.1',
        );
        asserts.assertThrows(
          () => ipv4ToLong('300.1.1.1'),
          Error,
          'Invalid IPv4 address: 300.1.1.1',
        );
      },
    );

    it('isIPv4InRange error conditions', () => {
      asserts.assertThrows(
        () => isIPv4InRange('256.0.0.1', '192.168.0.0', 24),
        Error,
        'Invalid IPv4 address: 256.0.0.1',
      );
      asserts.assertThrows(
        () => isIPv4InRange('192.168.0.1', '300.0.0.0', 24),
        Error,
        'Invalid IPv4 range start: 300.0.0.0',
      );
      asserts.assertThrows(
        () => isIPv4InRange('192.168.0.1', '192.168.0.0', -1),
        Error,
        'Invalid CIDR prefix: -1',
      );
      asserts.assertThrows(
        () => isIPv4InRange('192.168.0.1', '192.168.0.0', 33),
        Error,
        'Invalid CIDR prefix: 33',
      );
    });

    it('ipv6ToBinary additional mapped forms', () => {
      const mapped = ipv6ToBinary('::ffff:10.0.0.1');
      asserts.assertEquals(mapped.length, 128);
      const compatible = ipv6ToBinary('::10.0.0.1');
      asserts.assertEquals(compatible.length, 128);
    });
  });

  describe('round-3 regressions', () => {
    it('#1 places :: zero-fill correctly for mixed IPv6/IPv4 forms', () => {
      // Hex groups on BOTH sides of `::` before an IPv4 tail: the zero-fill
      // must sit where the `::` token is, not be relocated next to the leading
      // groups. Previously returned '64:ff9b:1:0:0:0:ffff:ffff'.
      asserts.assertEquals(
        expandIPv6('64:ff9b::1:255.255.255.255'),
        '64:ff9b:0:0:0:1:ffff:ffff',
      );
      // A mixed address and its pure-hex spelling must expand identically.
      asserts.assertEquals(
        expandIPv6('64:ff9b::1:1.2.3.4'),
        expandIPv6('64:ff9b::1:102:304'),
      );
      asserts.assertEquals(
        expandIPv6('64:ff9b::1:1.2.3.4'),
        '64:ff9b:0:0:0:1:102:304',
      );
      // Longer two-sided prefix.
      asserts.assertEquals(
        expandIPv6('2001:db8:1::5:6:1.2.3.4'),
        '2001:db8:1:0:5:6:102:304',
      );
    });

    it('#6 rejects malformed IPv6 (bare IPv4, leading single colon)', () => {
      asserts.assertEquals(expandIPv6('192.168.1.1'), null);
      asserts.assertEquals(expandIPv6(':ffff:1.2.3.4'), null);
      asserts.assertEquals(expandIPv6(':1.2.3.4'), null);
      // ipv6ToBinary must reject (throw) rather than yield a short binary.
      asserts.assertThrows(() => ipv6ToBinary('192.168.1.1'), Error);
      asserts.assertThrows(() => ipv6ToBinary(':ffff:1.2.3.4'), Error);
    });
  });
});

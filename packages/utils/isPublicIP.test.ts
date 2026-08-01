import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { isPublicIP } from './isPublicIP.ts';

describe('utils.isPublicIP', () => {
  it('IPv4 - should return true for public IPs', () => {
    const publicIPs = [
      '8.8.8.8', // Google DNS
      '1.1.1.1', // Cloudflare DNS
      '104.16.132.229', // Random public IP
      '23.45.67.89', // Another public IP
    ];

    for (const ip of publicIPs) {
      asserts.assert(isPublicIP(ip), `${ip} should be identified as public`);
    }
  });

  it('IPv4 - should return false for reserved / non-routable ranges (SSRF)', () => {
    // Ranges the classifier previously misclassified as public — an
    // allow/deny gate for outbound fetches must treat all of these as blocked.
    const reserved = [
      '100.64.0.1', // CGNAT / shared address space (RFC 6598)
      '100.127.255.255', // CGNAT boundary
      '192.0.0.1', // IETF protocol assignments (RFC 6890)
      '192.0.2.1', // TEST-NET-1 documentation (RFC 5737)
      '198.51.100.1', // TEST-NET-2 documentation (RFC 5737)
      '203.0.113.1', // TEST-NET-3 documentation (RFC 5737)
      '198.18.0.1', // Benchmarking (RFC 2544)
      '198.19.255.255', // Benchmarking boundary
      '224.0.0.1', // Multicast (RFC 5771)
      '239.255.255.255', // Multicast boundary
      '240.0.0.1', // Reserved / future use
      '255.255.255.255', // Limited broadcast
    ];

    for (const ip of reserved) {
      asserts.assert(
        !isPublicIP(ip),
        `${ip} (reserved/non-routable) should not be identified as public`,
      );
    }
  });

  it('IPv4 - should return false for private IPs', () => {
    const privateIPs = [
      '10.0.0.1', // Private network
      '10.255.255.255', // Private network boundary
      '172.16.0.1', // Private network
      '172.31.255.255', // Private network boundary
      '192.168.0.1', // Private network
      '192.168.255.255', // Private network boundary
      '127.0.0.1', // Localhost
      '127.255.255.255', // Localhost boundary
      '169.254.0.1', // Link-local
      '169.254.255.255', // Link-local boundary
      '0.0.0.0', // Current network
      '0.255.255.255', // Current network boundary
    ];

    for (const ip of privateIPs) {
      asserts.assert(!isPublicIP(ip), `${ip} should be identified as private`);
    }
  });

  it('IPv4 - should handle boundary cases', () => {
    // Boundary between private and public ranges
    asserts.assert(
      !isPublicIP('10.255.255.255'),
      'Last IP in 10.0.0.0/8 should be private',
    );
    asserts.assert(
      isPublicIP('11.0.0.0'),
      'First IP after 10.0.0.0/8 should be public',
    );

    asserts.assert(
      !isPublicIP('172.31.255.255'),
      'Last IP in 172.16.0.0/12 should be private',
    );
    asserts.assert(
      isPublicIP('172.32.0.0'),
      'First IP after 172.16.0.0/12 should be public',
    );

    asserts.assert(
      !isPublicIP('192.168.255.255'),
      'Last IP in 192.168.0.0/16 should be private',
    );
    asserts.assert(
      isPublicIP('192.169.0.0'),
      'First IP after 192.168.0.0/16 should be public',
    );
  });

  it('IPv6 - should return true for public IPs', () => {
    const publicIPs = [
      '2001:db8:85a3:0:0:8a2e:370:7334',
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      '2606:4700:4700::1111', // Cloudflare DNS
      '2001:4860:4860::8888', // Google DNS
      '2620:119:35::35', // OpenDNS
      '2a03:2880:f003:c07:face:b00c::2', // Example public IPv6
    ];

    for (const ip of publicIPs) {
      asserts.assert(isPublicIP(ip), `${ip} should be identified as public`);
    }
  });

  it('IPv6 - should return false for private IPs', () => {
    const privateIPs = [
      '::1', // Localhost
      'fe80::1234:5678:9abc', // Link-local
      'fe80::ffff:ffff:ffff:ffff', // Link-local boundary
      'fc00::1', // Unique local
      'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', // Unique local boundary
    ];

    for (const ip of privateIPs) {
      asserts.assert(!isPublicIP(ip), `${ip} should be identified as private`);
    }
  });

  it('IPv6 - should return false for multicast (ff00::/8)', () => {
    const multicast = [
      'ff02::1', // link-local all-nodes multicast
      'ff05::2', // site-local all-routers multicast
      'ffff::1', // multicast boundary (ff00::/8)
    ];
    for (const ip of multicast) {
      asserts.assert(
        !isPublicIP(ip),
        `${ip} (IPv6 multicast) should not be identified as public`,
      );
    }
  });

  it('IPv6 - should handle different formats', () => {
    // Same IP in different formats should return the same result
    const ip1 = '2001:0db8:0000:0000:0000:0000:0000:0001';
    const ip2 = '2001:db8::1';

    asserts.assertEquals(
      isPublicIP(ip1),
      isPublicIP(ip2),
      'Different formats of the same IPv6 should have the same result',
    );

    // Upper/lowercase should not matter
    asserts.assertEquals(
      isPublicIP('2001:DB8::1'),
      isPublicIP('2001:db8::1'),
      'Case should not affect the result',
    );
  });

  it('IPv6 - should not be bypassed by SSRF vectors', () => {
    // Link-local fe80::/10: addresses above fe80:: that still fall inside the
    // /10 must be treated as private (previously matched only as a string).
    const linkLocal = [
      'fe90::1', // inside fe80::/10
      'fea0::1', // inside fe80::/10
      'febf::1', // last /16 inside fe80::/10
    ];
    for (const ip of linkLocal) {
      asserts.assert(
        !isPublicIP(ip),
        `${ip} (fe80::/10 link-local) should be identified as private`,
      );
    }

    // IPv4-mapped IPv6 (::ffff:a.b.c.d) must inherit the embedded IPv4 status.
    const mappedPrivate = [
      '::ffff:127.0.0.1', // loopback
      '::ffff:192.168.1.1', // RFC 1918
      '::ffff:10.0.0.1', // RFC 1918
    ];
    for (const ip of mappedPrivate) {
      asserts.assert(
        !isPublicIP(ip),
        `${ip} (IPv4-mapped private) should be identified as private`,
      );
    }

    // Loopback in its fully expanded form and the unspecified address.
    asserts.assert(
      !isPublicIP('0:0:0:0:0:0:0:1'),
      'Expanded loopback (0:0:0:0:0:0:0:1) should be identified as private',
    );
    asserts.assert(
      !isPublicIP('::1'),
      'Loopback (::1) should be identified as private',
    );
    asserts.assert(
      !isPublicIP('::'),
      'Unspecified address (::) should not be identified as public',
    );

    // Genuinely public addresses must remain public after the fix.
    asserts.assert(
      isPublicIP('8.8.8.8'),
      '8.8.8.8 should remain public',
    );
    asserts.assert(
      isPublicIP('::ffff:8.8.8.8'),
      '::ffff:8.8.8.8 (IPv4-mapped public) should remain public',
    );
    asserts.assert(
      isPublicIP('2606:4700:4700::1111'),
      '2606:4700:4700::1111 (Cloudflare DNS) should remain public',
    );
  });

  it('should handle invalid inputs', () => {
    const invalidInputs = [
      '', // Empty string
      ' ', // Whitespace
      '256.1.2.3', // Invalid IPv4 octet
      '1.2.3', // Incomplete IPv4
      '1.2.3.4.5', // Too many octets
      '1.2.3.-1', // Negative octet
      '2001:xyz::1', // Invalid IPv6 hex
      '2001::db8::1', // Multiple :: in IPv6
      '2001:db8:1:2:3:4:5:6:7', // Too many segments
      'invalid', // Random string
      '::xxxx::', // Invalid IPv6
      undefined, // Undefined
      null, // Null
      {}, // Object
      [], // Array
      123, // Number
      true, // Boolean
    ];

    for (const input of invalidInputs) {
      // @ts-ignore - Testing invalid inputs
      asserts.assert(
        !isPublicIP(input as string),
        `${input} should be identified as invalid`,
      );
    }
  });

  it('round-3 #1 - classifies mixed IPv6/IPv4 forms on the correct value', () => {
    // isPublicIP now operates on the correctly-expanded 128-bit value for
    // mixed addresses with hex groups on both sides of `::`.
    asserts.assertEquals(
      isPublicIP('64:ff9b::1:8.8.8.8'),
      true,
      'globally routable mixed address should be public',
    );
    asserts.assertEquals(
      isPublicIP('fc00::1:1.2.3.4'),
      false,
      'unique-local (fc00::/7) mixed address is not public',
    );
  });
});

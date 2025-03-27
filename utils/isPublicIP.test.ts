import * as asserts from '$asserts';
import { isPublicIP } from './isPublicIP.ts';

Deno.test('utils.isPublicIP', async (t) => {
  await t.step('IPv4 - should return true for public IPs', () => {
    const publicIPs = [
      '8.8.8.8', // Google DNS
      '1.1.1.1', // Cloudflare DNS
      '203.0.113.1', // TEST-NET-3
      '198.51.100.1', // TEST-NET-2
      '104.16.132.229', // Random public IP
      '23.45.67.89', // Another public IP
    ];

    for (const ip of publicIPs) {
      asserts.assert(isPublicIP(ip), `${ip} should be identified as public`);
    }
  });

  await t.step('IPv4 - should return false for private IPs', () => {
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

  await t.step('IPv4 - should handle boundary cases', () => {
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

  await t.step('IPv6 - should return true for public IPs', () => {
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

  await t.step('IPv6 - should return false for private IPs', () => {
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

  await t.step('IPv6 - should handle different formats', () => {
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

  await t.step('should handle invalid inputs', () => {
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
});

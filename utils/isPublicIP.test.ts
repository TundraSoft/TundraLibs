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
      '169.254.0.1', // Link-local
      '0.0.0.0', // Current network
    ];

    for (const ip of privateIPs) {
      asserts.assert(!isPublicIP(ip), `${ip} should be identified as private`);
    }
  });

  await t.step('IPv6 - should return true for public IPs', () => {
    const publicIPs = [
      '2001:db8:85a3:0:0:8a2e:370:7334',
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      '2606:4700:4700::1111', // Cloudflare DNS
      '2001:4860:4860::8888', // Google DNS
    ];

    for (const ip of publicIPs) {
      asserts.assert(isPublicIP(ip), `${ip} should be identified as public`);
    }
  });

  await t.step('IPv6 - should return false for private IPs', () => {
    const privateIPs = [
      '::1', // Localhost
      'fe80::1234:5678:9abc', // Link-local
      'fc00::1', // Unique local
    ];

    for (const ip of privateIPs) {
      asserts.assert(!isPublicIP(ip), `${ip} should be identified as private`);
    }
  });

  await t.step('should handle invalid inputs', () => {
    const invalidInputs = [
      '', // Empty string
      '256.1.2.3', // Invalid IPv4
      '1.2.3', // Incomplete IPv4
      '2001:xyz::1', // Invalid IPv6
      'invalid', // Random string
      '::xxxx::', // Invalid IPv6
      undefined, // Undefined
      null, // Null
    ];

    for (const input of invalidInputs) {
      // @ts-ignore - Testing invalid inputs
      asserts.assert(
        !isPublicIP(input!),
        `${input} should be identified as invalid`,
      );
    }
  });
});

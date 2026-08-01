/**
 * @fileoverview Public IP address detection for IPv4 and IPv6.
 *
 * This module determines whether an IP address is publicly routable or belongs
 * to private, local, or reserved address ranges. It supports both IPv4 (RFC 1918)
 * and IPv6 (RFC 4193, RFC 4291) address spaces.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { isPublicIP } from '@tundralibs/utils';
 *
 * isPublicIP('8.8.8.8');        // true - Google DNS
 * isPublicIP('192.168.1.1');    // false - private network
 * isPublicIP('2001:4860::8888'); // true - Google IPv6 DNS
 * ```
 */

import {
  expandIPv6,
  IPV4_REGEX,
  IPV6_REGEX,
  ipv6ToBinary,
  isIPv4InRange,
  isValidIPv4,
  isValidIPv6Structure,
} from './ipUtils.ts';

// Define private network ranges as [startIP, CIDR mask]
type IPRange = [string, number];

const ipv4Ranges: IPRange[] = [
  ['0.0.0.0', 8], // Current network (RFC 1122)
  ['10.0.0.0', 8], // Private network (RFC 1918)
  ['100.64.0.0', 10], // Carrier-grade NAT / shared address space (RFC 6598)
  ['127.0.0.0', 8], // Localhost (RFC 1122)
  ['169.254.0.0', 16], // Link-local (RFC 3927)
  ['172.16.0.0', 12], // Private network (RFC 1918)
  ['192.0.0.0', 24], // IETF protocol assignments (RFC 6890)
  ['192.0.2.0', 24], // TEST-NET-1 documentation range (RFC 5737)
  ['192.168.0.0', 16], // Private network (RFC 1918)
  ['198.18.0.0', 15], // Benchmarking (RFC 2544)
  ['198.51.100.0', 24], // TEST-NET-2 documentation range (RFC 5737)
  ['203.0.113.0', 24], // TEST-NET-3 documentation range (RFC 5737)
  ['224.0.0.0', 4], // Multicast (RFC 5771)
  ['240.0.0.0', 4], // Reserved; also covers broadcast 255.255.255.255 (RFC 1112)
];

// Unique local, link-local, and multicast address ranges for IPv6.
// Stored as the network's binary prefix (network address truncated to the CIDR
// length) so membership can be tested with a binary-prefix comparison rather
// than fragile string matching. This correctly covers the whole /7, /10, /8.
const ipv6BinaryRanges: string[] = [
  ipv6ToBinary('fc00::').substring(0, 7), // Unique local address (RFC 4193)
  ipv6ToBinary('fe80::').substring(0, 10), // Link-local address (RFC 4291)
  ipv6ToBinary('ff00::').substring(0, 8), // Multicast (RFC 4291)
];

/**
 * Returns true when an IPv4 address falls inside one of the reserved
 * (private/local) IPv4 ranges, i.e. it is NOT publicly routable.
 */
const isReservedIPv4 = (ip: string): boolean =>
  ipv4Ranges.some(([range, cidr]) => isIPv4InRange(ip, range, cidr));

/**
 * Detects an IPv4-mapped IPv6 address (::ffff:a.b.c.d / RFC 4291 2.5.5.2) from
 * its 128-bit binary form and, if present, returns the embedded IPv4 address;
 * otherwise returns null.
 *
 * The mapped form is identified by the 80 leading zero bits followed by the
 * 16-bit `ffff` marker; the final 32 bits are the embedded IPv4 octets.
 */
const extractIPv4Mapped = (binary: string): string | null => {
  // First 80 bits zero, next 16 bits all ones (ffff) => IPv4-mapped.
  if (binary.substring(0, 80) !== '0'.repeat(80)) return null;
  if (binary.substring(80, 96) !== '1'.repeat(16)) return null;

  const octets: number[] = [];
  for (let i = 96; i < 128; i += 8) {
    octets.push(Number.parseInt(binary.substring(i, i + 8), 2));
  }
  return octets.join('.');
};

/**
 * Checks if an IP address is public (not in private, local, or reserved ranges)
 *
 * @param ip - IP address to check (IPv4 or IPv6)
 * @returns true if the IP is public, false otherwise
 *
 * @example
 * isPublicIP('8.8.8.8') // true (Google DNS)
 * isPublicIP('192.168.1.1') // false (private network)
 * isPublicIP('2001:4860:4860::8888') // true (Google DNS)
 * isPublicIP('fe80::1') // false (link-local)
 */
export const isPublicIP = (ip: string): boolean => {
  if (!ip || typeof ip !== 'string') return false;

  ip = ip.trim();

  // IPv4 check
  if (IPV4_REGEX.test(ip)) {
    // Validate each octet is in range 0-255
    if (!isValidIPv4(ip)) return false;

    return !isReservedIPv4(ip);
  }

  // IPv6 check - use regex and additional structure validation
  if (IPV6_REGEX.test(ip) && isValidIPv6Structure(ip)) {
    // Expand to the canonical 8-segment form so every notation (compressed,
    // full, or IPv4-mapped) is compared on equal footing.
    const expandedIP = expandIPv6(ip);
    if (!expandedIP) return false;

    // Loopback (::1 / 0:0:0:0:0:0:0:1) and the unspecified address (::) are
    // never publicly routable.
    if (expandedIP === '0:0:0:0:0:0:0:1') return false; // loopback (RFC 4291)
    if (expandedIP === '0:0:0:0:0:0:0:0') return false; // unspecified (::)

    const binary = ipv6ToBinary(expandedIP);

    // IPv4-mapped IPv6 (::ffff:a.b.c.d) carries an embedded IPv4 address; its
    // public/private status is governed entirely by the IPv4 ranges.
    const mappedIPv4 = extractIPv4Mapped(binary);
    if (mappedIPv4 !== null) {
      return !isReservedIPv4(mappedIPv4);
    }

    // Test fc00::/7 (unique local) and fe80::/10 (link-local) using a
    // binary-prefix comparison, mirroring how isInSubnet performs membership.
    return !ipv6BinaryRanges.some((prefix) =>
      binary.substring(0, prefix.length) === prefix
    );
  }

  return false;
};

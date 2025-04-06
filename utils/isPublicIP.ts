import {
  IPV4_REGEX,
  IPV6_REGEX,
  isIPv4InRange,
  isValidIPv4,
  isValidIPv6Structure,
} from './ipUtils.ts';

// Define private network ranges as [startIP, CIDR mask]
type IPRange = [string, number];

const ipv4Ranges: IPRange[] = [
  ['10.0.0.0', 8], // Private network (RFC 1918)
  ['172.16.0.0', 12], // Private network (RFC 1918)
  ['192.168.0.0', 16], // Private network (RFC 1918)
  ['169.254.0.0', 16], // Link-local (RFC 3927)
  ['127.0.0.0', 8], // Localhost (RFC 1122)
  ['0.0.0.0', 8], // Current network (RFC 1122)
];

// Unique local addresses and link-local addresses for IPv6
const ipv6Ranges: IPRange[] = [
  ['fc00::', 7], // Unique local address (RFC 4193)
  ['fe80::', 10], // Link-local address (RFC 4291)
];

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

    return !ipv4Ranges.some(([range, cidr]) => isIPv4InRange(ip, range, cidr));
  }

  // IPv6 check - use regex and additional structure validation
  if (IPV6_REGEX.test(ip) && isValidIPv6Structure(ip)) {
    const normalizedIP = ip.toLowerCase();
    if (normalizedIP === '::1') return false; // localhost

    // Handle fc00::/7 range (unique local addresses) which covers fc00:: to fdff::
    // This includes both fc and fd prefixes
    if (normalizedIP.startsWith('fc') || normalizedIP.startsWith('fd')) {
      return false;
    }

    // Check other IPv6 ranges like fe80::/10 (link-local)
    return !ipv6Ranges.some(([prefix, _cidr]) =>
      normalizedIP.startsWith(prefix.split(':')[0]!)
    );
  }

  return false;
};

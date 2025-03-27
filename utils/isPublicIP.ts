// Pre-compile regular expressions for better performance
const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;

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
 * Converts an IPv4 address to a 32-bit unsigned integer
 * @param ip - IPv4 address in dot-decimal notation
 * @returns 32-bit unsigned integer representation of the IP
 */
const ipToLong = (ip: string): number => {
  return ip.split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
};

/**
 * Checks if an IPv4 address is within a specified range
 * @param ip - IPv4 address to check
 * @param rangeStart - Start of IP range
 * @param cidr - CIDR mask for the range
 * @returns true if the IP is within the range, false otherwise
 */
const isIPv4InRange = (
  ip: string,
  rangeStart: string,
  cidr: number,
): boolean => {
  const ipLong = ipToLong(ip);
  const rangeLong = ipToLong(rangeStart);
  const mask = ~((1 << (32 - cidr)) - 1);
  return (ipLong & mask) === (rangeLong & mask);
};

/**
 * Validates an IPv6 address structure
 * @param ip - The IPv6 address to validate
 * @returns true if the IPv6 has valid structure, false otherwise
 */
const isValidIPv6Structure = (ip: string): boolean => {
  // Check for multiple double colons (only one allowed)
  if ((ip.match(/::/g) || []).length > 1) {
    return false;
  }

  // Split by : and check segment count
  const segments = ip.split(':');

  // If using compression (::), make sure the total expanded would not exceed 8 segments
  if (ip.includes('::')) {
    // Count non-empty segments outside of the ::
    const nonEmptySegments = segments.filter((s) => s !== '').length;
    if (nonEmptySegments > 7) {
      return false;
    }
  } else {
    // Without compression, must have exactly 8 segments
    if (segments.length !== 8) {
      return false;
    }
  }

  // Each segment must be valid hexadecimal (0-4 chars)
  return segments.every((segment) => {
    return segment === '' || /^[0-9A-Fa-f]{1,4}$/.test(segment);
  });
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

  // IPv4 check
  if (ipv4Regex.test(ip)) {
    // Validate each octet is in range 0-255
    const octets = ip.split('.');
    if (
      !octets.every((octet) => {
        const num = parseInt(octet, 10);
        return num >= 0 && num <= 255;
      })
    ) {
      return false;
    }

    return !ipv4Ranges.some(([range, cidr]) => isIPv4InRange(ip, range, cidr));
  }

  // IPv6 check - use regex and additional structure validation
  if (ipv6Regex.test(ip) && isValidIPv6Structure(ip)) {
    const normalizedIP = ip.toLowerCase();
    if (normalizedIP === '::1') return false; // localhost

    // Handle fc00::/7 range (unique local addresses) which covers fc00:: to fdff::
    // This includes both fc and fd prefixes
    if (normalizedIP.startsWith('fc') || normalizedIP.startsWith('fd')) {
      return false;
    }

    // Check other IPv6 ranges like fe80::/10 (link-local)
    return !ipv6Ranges.some(([prefix, _cidr]) =>
      normalizedIP.startsWith(prefix)
    );
  }

  return false;
};

/**
 * Shared utility functions for IP address handling, validation, and conversion.
 */

// Pre-compiled regex patterns for better performance
export const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
export const IPV6_REGEX =
  /^([0-9a-fA-F]{0,4}:){1,7}([0-9a-fA-F]{0,4}|(\d{1,3}\.){3}\d{1,3})$|^::(ffff:)?(\d{1,3}\.){3}\d{1,3}$/;
export const IPV4_SEGMENT = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;
export const IPV6_SEGMENT = /^[0-9A-Fa-f]{1,4}$/;

// Constants
export const IPV4_MAX_SUBNET = 32;
export const IPV6_MAX_SUBNET = 128;

/**
 * Validates that an IPv4 address has valid octets (0-255)
 * @param ip - IPv4 address to validate
 * @returns true if all octets are valid
 */
export const isValidIPv4 = (ip: string): boolean => {
  if (!IPV4_REGEX.test(ip)) return false;

  return ip.split('.').every((octet) => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
};

/**
 * Validates IPv6 address structure
 * @param ip - The IPv6 address to validate
 * @returns true if the IPv6 has valid structure, false otherwise
 */
export const isValidIPv6Structure = (ip: string): boolean => {
  if (!IPV6_REGEX.test(ip)) return false;

  // Check for multiple double colons (only one allowed)
  if ((ip.match(/::/g) || []).length > 1) {
    return false;
  }

  // Check for invalid colon sequences like :::
  if (ip.includes(':::') || ip.match(/:{3,}/)) {
    return false;
  }

  // If contains IPv4 part, validate that part separately
  if (ip.includes('.')) {
    const ipv4Part = ip.match(/(\d{1,3}\.){3}\d{1,3}$/)?.[0];
    if (!ipv4Part || !isValidIPv4(ipv4Part)) return false;
  }

  // If not using compression, validate all segments
  if (!ip.includes('::')) {
    const segments = ip.split(':');
    if (ip.includes('.')) {
      // For IPv4-mapped addresses, should have 6 hex segments + IPv4 part
      if (segments.length !== 7) return false;
    } else {
      // Regular IPv6 should have 8 segments
      if (segments.length !== 8) return false;
    }
  }

  // Each hex segment must be valid
  const segments = ip.split(':');
  return segments.every((segment) => {
    return segment === '' || IPV6_SEGMENT.test(segment) ||
      IPV4_REGEX.test(segment);
  });
};

/**
 * Converts an IPv4 segment to its hexadecimal IPv6 representation
 * @param ipv4 - IPv4 address in dot-decimal notation
 * @returns Hexadecimal representation for IPv6
 */
export const ipv4ToHexSegments = (ipv4: string): string[] => {
  const octets = ipv4.split('.').map((o) => parseInt(o, 10));
  return [
    ((octets[0]! << 8) + octets[1]!).toString(16),
    ((octets[2]! << 8) + octets[3]!).toString(16),
  ];
};

/**
 * Expands compressed IPv6 notation to full form
 * @param ip - IPv6 address, potentially compressed
 * @returns Expanded IPv6 address or null if invalid
 */
export const expandIPv6 = (ip: string): string | null => {
  // Handle empty input
  if (!ip) return null;

  // Normalize the address to lowercase
  const normalizedIP = ip.toLowerCase();

  // Reject invalid hex digits early
  if (/[^0-9a-f:\.]/i.test(normalizedIP)) {
    return null;
  }

  // Check for invalid colon sequences
  if (normalizedIP.includes(':::') || normalizedIP.match(/:{3,}/)) {
    return null;
  }

  // Handle IPv4-mapped IPv6 addresses
  if (normalizedIP.includes('.')) {
    const ipv4PartMatch = normalizedIP.match(/(\d{1,3}\.){3}\d{1,3}$/);
    if (!ipv4PartMatch) return null;

    const ipv4Part = ipv4PartMatch[0];
    if (!isValidIPv4(ipv4Part)) return null;

    const prefix = normalizedIP.substring(0, normalizedIP.indexOf(ipv4Part))
      .replace(/::$/, ':');

    // Convert IPv4 part to IPv6 hex format
    const hexSegments = ipv4ToHexSegments(ipv4Part);

    // Handle ::ffff:a.b.c.d format (IPv4-mapped IPv6)
    if (prefix === '::ffff:' || prefix === ':ffff:') {
      return '0:0:0:0:0:ffff:' + hexSegments.join(':');
    } // Handle ::a.b.c.d format
    else if (prefix === '::' || prefix === ':') {
      return '0:0:0:0:0:0:' + hexSegments.join(':');
    } // Handle other formats with IPv4 part
    else {
      const prefixParts = prefix.split(':').filter((p) => p !== '');

      if (prefixParts.length > 6) return null;

      if (normalizedIP.includes('::')) {
        const missingGroups = 6 - prefixParts.length;
        if (missingGroups < 0) return null;

        const zeroGroups = Array(missingGroups).fill('0');
        const expandedParts = prefix.startsWith(':')
          ? [...zeroGroups, ...prefixParts]
          : [...prefixParts, ...zeroGroups];

        return [...expandedParts, ...hexSegments].join(':');
      } else {
        return [...prefixParts, ...hexSegments].join(':');
      }
    }
  }

  // Handle compressed notation (::)
  if (normalizedIP.includes('::')) {
    // Ensure there's only one double colon
    if ((normalizedIP.match(/::/g) || []).length > 1) return null;

    const [left, right] = normalizedIP.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];

    // Calculate how many zero groups to insert
    const missingGroups = 8 - (leftParts.length + rightParts.length);
    if (missingGroups < 0) return null;

    // Create the expanded address
    const zeroGroups = Array(missingGroups).fill('0');
    const expandedParts = [...leftParts, ...zeroGroups, ...rightParts];

    // Ensure we have exactly 8 parts
    return expandedParts
      .map((part) => part || '0') // Replace empty segments with '0'
      .join(':');
  }

  // Handle full notation
  const parts = normalizedIP.split(':');
  if (parts.length !== 8) return null;

  // Verify each part is valid hex
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) {
      return null;
    }
  }

  return parts.join(':');
};

/**
 * Converts an IPv4 address to its binary representation
 * @param ip - IPv4 address in dot-decimal notation
 * @returns Binary string representation of the IP
 */
export const ipv4ToBinary = (ip: string): string => {
  return ip.split('.')
    .map((part) => parseInt(part, 10).toString(2).padStart(8, '0'))
    .join('');
};

/**
 * Converts an IPv6 address to its binary representation
 * @param ip - IPv6 address
 * @returns Binary string representation of the IP
 */
export const ipv6ToBinary = (ip: string): string => {
  // Normalize and expand the IPv6 address
  const expandedIP = expandIPv6(ip);
  if (!expandedIP) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  // Convert each hexadecimal segment to binary
  return expandedIP.split(':')
    .map((segment) => parseInt(segment, 16).toString(2).padStart(16, '0'))
    .join('');
};

/**
 * Converts an IPv4 address to a 32-bit unsigned integer
 * @param ip - IPv4 address in dot-decimal notation
 * @returns 32-bit unsigned integer representation of the IP
 */
export const ipv4ToLong = (ip: string): number => {
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
export const isIPv4InRange = (
  ip: string,
  rangeStart: string,
  cidr: number,
): boolean => {
  const ipLong = ipv4ToLong(ip);
  const rangeLong = ipv4ToLong(rangeStart);
  const mask = ~((1 << (32 - cidr)) - 1);
  return (ipLong & mask) === (rangeLong & mask);
};

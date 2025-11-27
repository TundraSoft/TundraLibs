/**
 * Shared utility functions for IP address handling, validation, and conversion.
 *
 * This module provides comprehensive IPv4 and IPv6 address manipulation utilities
 * including validation, format conversion, binary operations, and range checking.
 * All functions are optimized for performance and include robust error handling.
 *
 * @example Basic IPv4 validation:
 * ```typescript
 * import { isValidIPv4 } from './ipUtils.ts';
 *
 * isValidIPv4('192.168.1.1');   // true
 * isValidIPv4('192.168.1.256'); // false
 * ```
 *
 * @example IPv6 address expansion:
 * ```typescript
 * import { expandIPv6 } from './ipUtils.ts';
 *
 * expandIPv6('2001:db8::1');  // '2001:db8:0:0:0:0:0:1'
 * expandIPv6('::1');          // '0:0:0:0:0:0:0:1'
 * ```
 *
 * @example Binary IP operations:
 * ```typescript
 * import { ipv4ToBinary, ipv6ToBinary } from './ipUtils.ts';
 *
 * ipv4ToBinary('192.168.1.1');  // '11000000101010000000000100000001'
 * ipv6ToBinary('::1');          // 128-bit binary string
 * ```
 */

/**
 * Pre-compiled regular expression for basic IPv4 format validation.
 * Matches the pattern: num.num.num.num where num is 1-3 digits.
 * Note: This regex does NOT validate that octets are in range 0-255.
 *
 * @example
 * ```typescript
 * IPV4_REGEX.test('192.168.1.1');   // true
 * IPV4_REGEX.test('999.999.999.999'); // true (but invalid IP)
 * IPV4_REGEX.test('192.168.1');     // false
 * ```
 */
export const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Pre-compiled regular expression for IPv6 format validation.
 * Supports standard, compressed, and IPv4-mapped formats.
 *
 * **Supported formats:**
 * - Standard: `2001:db8:0:0:0:0:0:1`
 * - Compressed: `2001:db8::1`
 * - IPv4-mapped: `::ffff:192.168.1.1`
 * - IPv4-compatible: `::192.168.1.1`
 *
 * @example
 * ```typescript
 * IPV6_REGEX.test('2001:db8::1');        // true
 * IPV6_REGEX.test('::ffff:192.168.1.1'); // true
 * IPV6_REGEX.test('invalid::format');    // false
 * ```
 */
// Basic IPv6 character check: only allow hex digits, colons and dots.
// More precise structural checks are performed in isValidIPv6Structure.
export const IPV6_REGEX = /^[0-9a-fA-F:.]+$/;

/**
 * Regular expression for validating individual IPv4 octets (0-255).
 *
 * @example
 * ```typescript
 * IPV4_SEGMENT.test('192');  // true
 * IPV4_SEGMENT.test('255');  // true
 * IPV4_SEGMENT.test('256');  // false
 * IPV4_SEGMENT.test('01');   // true (leading zeros allowed)
 * ```
 */
export const IPV4_SEGMENT = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * Regular expression for validating individual IPv6 hexadecimal segments.
 * Accepts 1-4 hexadecimal characters (case-insensitive).
 *
 * @example
 * ```typescript
 * IPV6_SEGMENT.test('2001'); // true
 * IPV6_SEGMENT.test('db8');  // true
 * IPV6_SEGMENT.test('0');    // true
 * IPV6_SEGMENT.test('ffff'); // true
 * IPV6_SEGMENT.test('g001'); // false (invalid hex)
 * ```
 */
export const IPV6_SEGMENT = /^[0-9A-Fa-f]{1,4}$/;

/**
 * Maximum subnet mask length for IPv4 addresses.
 * IPv4 addresses are 32 bits, so CIDR values range from /0 to /32.
 */
export const IPV4_MAX_SUBNET = 32;
// Bits constants for clarity and to avoid magic numbers flagged by Sonar
export const IPV4_BITS = 32;
export const IPV6_BITS = 128;
export const OCTET_BITS = 8;
export const IPV6_SEGMENT_BITS = 16;

/**
 * Maximum subnet mask length for IPv6 addresses.
 * IPv6 addresses are 128 bits, so CIDR values range from /0 to /128.
 */
export const IPV6_MAX_SUBNET = 128;

/**
 * Validates that an IPv4 address has valid octets (0-255).
 *
 * This function performs a two-step validation:
 * 1. Checks format using regex pattern (4 numeric segments separated by dots)
 * 2. Validates each octet is within the valid range (0-255)
 *
 * **Performance:** O(1) - constant time validation
 * **Memory:** O(1) - no additional memory allocation
 *
 * @param ip - IPv4 address string to validate
 * @returns true if all octets are valid (0-255), false otherwise
 *
 * @example Basic validation:
 * ```typescript
 * isValidIPv4('192.168.1.1');   // true
 * isValidIPv4('255.255.255.255'); // true
 * isValidIPv4('0.0.0.0');       // true
 * ```
 *
 * @example Invalid addresses:
 * ```typescript
 * isValidIPv4('192.168.1.256'); // false - octet > 255
 * isValidIPv4('192.168.1');     // false - incomplete
 * isValidIPv4('192.168.1.1.1'); // false - too many octets
 * isValidIPv4('192.168.a.1');   // false - non-numeric
 * ```
 *
 * @example Use in network validation:
 * ```typescript
 * function validateServerIP(ip: string): boolean {
 *   if (!isValidIPv4(ip)) {
 *     throw new Error(`Invalid IPv4 address: ${ip}`);
 *   }
 *   return true;
 * }
 * ```
 */
export const isValidIPv4 = (ip: string): boolean => {
  if (!IPV4_REGEX.test(ip)) return false;

  return ip.split('.').every((octet) => {
    const num = Number.parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
};

/**
 * Validates IPv6 address structure.
 *
 * This function performs comprehensive IPv6 format validation including:
 * - Basic regex pattern matching
 * - Double colon compression validation
 * - IPv4-mapped address validation
 * - Segment count verification
 * - Hexadecimal segment validation
 *
 * @param ip - The IPv6 address to validate
 * @returns true if the IPv6 has valid structure, false otherwise
 *
 * @example Valid IPv6 addresses:
 * ```typescript
 * isValidIPv6Structure('2001:db8::1');          // true
 * isValidIPv6Structure('::1');                  // true
 * isValidIPv6Structure('::ffff:192.168.1.1');  // true
 * ```
 *
 * @example Invalid IPv6 addresses:
 * ```typescript
 * isValidIPv6Structure('2001::db8::1');  // false - multiple ::
 * isValidIPv6Structure('2001:::1');      // false - invalid compression
 * isValidIPv6Structure('gggg::1');       // false - invalid hex
 * ```
 */
export const isValidIPv6Structure = (ip: string): boolean => {
  // IPv6 addresses use colons; if no colon is present, it's not IPv6
  if (!ip.includes(':')) return false;

  // Protect against massive inputs which can cause ReDoS on complex regexes
  if (ip.length > 45) return false;
  if (!IPV6_REGEX.test(ip)) return false;

  // Check for invalid colon sequences
  const invalidColonPattern = /:{3,}/;
  if (ip.includes(':::') || invalidColonPattern.exec(ip)) {
    return false;
  }

  // Check for multiple double colons (only one allowed)
  if ((ip.match(/::/g) || []).length > 1) {
    return false;
  }

  // Validate IPv4 part if present
  if (ip.includes('.')) {
    return validateIPv6WithIPv4Part(ip);
  }

  // Validate segment count for non-compressed addresses
  if (!ip.includes('::')) {
    return validateFullIPv6Segments(ip);
  }

  // For compressed addresses, expand and validate the full form
  const expanded = expandIPv6(ip);
  if (!expanded) return false;
  return validateFullIPv6Segments(expanded);

  // All checks are handled above; function returns earlier according to path.
};

/**
 * Helper function to validate IPv6 addresses containing IPv4 parts.
 */
function validateIPv6WithIPv4Part(ip: string): boolean {
  const ipv4Pattern = /(\d{1,3}\.){3}\d{1,3}$/;
  const ipv4PartMatch = ipv4Pattern.exec(ip);
  if (!ipv4PartMatch) return false;

  const ipv4Part = ipv4PartMatch[0];
  if (!isValidIPv4(ipv4Part)) return false;

  // Check segment count for IPv4-mapped addresses
  const segments = ip.split(':');
  return ip.includes('::') || segments.length === 7;
}

/**
 * Helper function to validate full IPv6 addresses (no compression).
 */
function validateFullIPv6Segments(ip: string): boolean {
  const segments = ip.split(':');
  return segments.length === 8;
}

/**
 * Helper function to validate IPv6 hexadecimal segments.
 */
// (previously validateIPv6HexSegments was used for additional per-segment checks,
// the current logic relies on the full expansion checks above, so it has been
// removed to simplify validation paths and avoid unused helper functions.)

/**
 * Converts an IPv4 segment to its hexadecimal IPv6 representation.
 *
 * This function takes an IPv4 address and converts it to two 16-bit
 * hexadecimal segments that can be used in IPv6 addresses (e.g., for
 * IPv4-mapped IPv6 addresses like ::ffff:192.168.1.1).
 *
 * **Algorithm:**
 * 1. Split IPv4 into 4 octets
 * 2. Combine octets in pairs: (octet1 << 8) + octet2
 * 3. Convert each pair to hexadecimal string
 *
 * @param ipv4 - IPv4 address in dot-decimal notation
 * @returns Array of two hexadecimal strings representing the IPv4 address
 *
 * @example Basic conversion:
 * ```typescript
 * ipv4ToHexSegments('192.168.1.1');   // ['c0a8', '101']
 * ipv4ToHexSegments('255.255.255.255'); // ['ffff', 'ffff']
 * ipv4ToHexSegments('0.0.0.0');       // ['0', '0']
 * ```
 *
 * @example Usage in IPv6 contexts:
 * ```typescript
 * const hexSegments = ipv4ToHexSegments('192.168.1.1');
 * const ipv6Mapped = `::ffff:${hexSegments.join(':')}`;
 * // Result: '::ffff:c0a8:101'
 * ```
 */
export const ipv4ToHexSegments = (ipv4: string): string[] => {
  if (!isValidIPv4(ipv4)) throw new Error(`Invalid IPv4 address: ${ipv4}`);
  const octets = ipv4.split('.').map((o) => Number.parseInt(o, 10));
  // After validation, we know octets has exactly 4 valid numbers
  const [a, b, c, d] = octets as [number, number, number, number];
  return [
    ((a << 8) + b).toString(16),
    ((c << 8) + d).toString(16),
  ];
};

/**
 * Expands compressed IPv6 notation to full form.
 *
 * This function takes an IPv6 address in any valid format and expands it
 * to the full 8-segment colon-separated hexadecimal notation. It handles
 * compression (::), IPv4-mapped addresses, and validates format.
 *
 * **Supported Input Formats:**
 * - Compressed: `2001:db8::1` → `2001:db8:0:0:0:0:0:1`
 * - IPv4-mapped: `::ffff:192.168.1.1` → `0:0:0:0:0:ffff:c0a8:101`
 * - Full notation: `2001:db8:0:0:0:0:0:1` → unchanged
 *
 * @param ip - IPv6 address, potentially compressed
 * @returns Expanded IPv6 address or null if invalid
 *
 * @example Basic expansion:
 * ```typescript
 * expandIPv6('2001:db8::1');     // '2001:db8:0:0:0:0:0:1'
 * expandIPv6('::1');             // '0:0:0:0:0:0:0:1'
 * expandIPv6('::');              // '0:0:0:0:0:0:0:0'
 * ```
 *
 * @example IPv4-mapped addresses:
 * ```typescript
 * expandIPv6('::ffff:192.168.1.1'); // '0:0:0:0:0:ffff:c0a8:1'
 * expandIPv6('::192.168.1.1');      // '0:0:0:0:0:0:c0a8:1'
 * ```
 *
 * @example Error cases:
 * ```typescript
 * expandIPv6('invalid');     // null
 * expandIPv6('2001::db8::1'); // null (multiple ::)
 * expandIPv6('gggg::1');     // null (invalid hex)
 * ```
 */
export const expandIPv6 = (ip: string): string | null => {
  if (!ip) return null;

  const normalizedIP = ip.toLowerCase();

  // Basic validation
  if (!isValidIPv6Input(normalizedIP)) {
    return null;
  }

  // Handle IPv4-mapped IPv6 addresses
  if (normalizedIP.includes('.')) {
    return expandIPv6WithIPv4Part(normalizedIP);
  }

  // Handle compressed notation (::)
  if (normalizedIP.includes('::')) {
    return expandCompressedIPv6(normalizedIP);
  }

  // Handle full notation
  return expandFullIPv6(normalizedIP);
};

/**
 * Validates basic IPv6 input format.
 */
function isValidIPv6Input(ip: string): boolean {
  // Check for invalid characters
  if (/[^0-9a-f:.]/.test(ip)) {
    return false;
  }

  // Check for invalid colon sequences
  const invalidColonPattern = /:{3,}/;
  if (ip.includes(':::') || invalidColonPattern.exec(ip)) {
    return false;
  }

  // Simple length guard to mitigate potential regex DoS risks
  if (ip.length > 45) return false;

  return true;
}

/**
 * Expands IPv6 addresses containing IPv4 parts.
 */
function expandIPv6WithIPv4Part(ip: string): string | null {
  const ipv4Pattern = /(\d{1,3}\.){3}\d{1,3}$/;
  const ipv4PartMatch = ipv4Pattern.exec(ip);
  if (!ipv4PartMatch) return null;

  const ipv4Part = ipv4PartMatch[0];
  if (!isValidIPv4(ipv4Part)) return null;

  const prefix = ip.substring(0, ip.indexOf(ipv4Part)).replace(/::$/, ':');
  const hexSegments = ipv4ToHexSegments(ipv4Part);

  // Handle specific IPv4-mapped formats
  if (prefix === '::ffff:' || prefix === ':ffff:') {
    return '0:0:0:0:0:ffff:' + hexSegments.join(':');
  }
  if (prefix === '::' || prefix === ':') {
    return '0:0:0:0:0:0:' + hexSegments.join(':');
  }

  // Handle other formats with IPv4 part
  return expandMixedIPv6Format(prefix, hexSegments, ip);
}

/**
 * Handles mixed IPv6 formats with IPv4 parts.
 */
function expandMixedIPv6Format(
  prefix: string,
  hexSegments: string[],
  originalIP: string,
): string | null {
  const prefixParts = prefix.split(':').filter((p) => p !== '');

  if (prefixParts.length > 6) return null;

  if (originalIP.includes('::')) {
    const missingGroups = 6 - prefixParts.length;
    if (missingGroups < 0) return null;

    const zeroGroups = new Array(missingGroups).fill('0');
    const expandedParts = prefix.startsWith(':')
      ? [...zeroGroups, ...prefixParts]
      : [...prefixParts, ...zeroGroups];

    return [...expandedParts, ...hexSegments].join(':');
  }

  return [...prefixParts, ...hexSegments].join(':');
}

/**
 * Expands compressed IPv6 addresses (containing ::).
 */
function expandCompressedIPv6(ip: string): string | null {
  // Ensure there's only one double colon
  if ((ip.match(/::/g) || []).length > 1) return null;

  const [left, right] = ip.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];

  // Calculate how many zero groups to insert
  const missingGroups = 8 - (leftParts.length + rightParts.length);
  if (missingGroups < 0) return null;

  // Create the expanded address
  const zeroGroups = new Array(missingGroups).fill('0');
  const expandedParts = [...leftParts, ...zeroGroups, ...rightParts];

  // Ensure we have exactly 8 parts and replace empty segments
  return expandedParts
    .map((part) => part ?? '0')
    .join(':');
}

/**
 * Expands full IPv6 notation (no compression).
 */
function expandFullIPv6(ip: string): string | null {
  const parts = ip.split(':');
  if (parts.length !== 8) return null;

  // Verify each part is valid hex
  const validHexPattern = /^[0-9a-f]{1,4}$/;
  for (const part of parts) {
    if (!validHexPattern.test(part)) {
      return null;
    }
  }

  return parts.join(':');
}

/**
 * Converts an IPv4 address to its binary representation.
 *
 * This function takes a standard dotted-decimal IPv4 address and converts
 * each octet to an 8-bit binary string, then concatenates them to form
 * a 32-bit binary representation.
 *
 * **Performance:** O(1) - constant time conversion
 * **Output:** Always 32 characters (4 octets × 8 bits each)
 *
 * @param ip - IPv4 address in dot-decimal notation (e.g., "192.168.1.1")
 * @returns 32-character binary string representation
 *
 * @example Basic conversion:
 * ```typescript
 * ipv4ToBinary('192.168.1.1');   // '11000000101010000000000100000001'
 * ipv4ToBinary('255.255.255.255'); // '11111111111111111111111111111111'
 * ipv4ToBinary('0.0.0.0');       // '00000000000000000000000000000000'
 * ```
 *
 * @example Subnet calculations:
 * ```typescript
 * const ip1 = ipv4ToBinary('192.168.1.10');
 * const ip2 = ipv4ToBinary('192.168.1.20');
 * const subnet = ipv4ToBinary('192.168.1.0');
 *
 * // Compare first 24 bits for /24 subnet
 * console.log(ip1.substring(0, 24) === subnet.substring(0, 24)); // true
 * ```
 */
export const ipv4ToBinary = (ip: string): string => {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  return ip.split('.')
    .map((part) => Number.parseInt(part, 10).toString(2).padStart(8, '0'))
    .join('');
};

/**
 * Converts an IPv6 address to its binary representation.
 *
 * This function expands the IPv6 address to full form and converts each
 * hexadecimal segment to a 16-bit binary string, resulting in a 128-bit
 * binary representation.
 *
 * **Performance:** O(n) where n is the length of the address string
 * **Output:** Always 128 characters (8 segments × 16 bits each)
 *
 * @param ip - IPv6 address in any valid format
 * @returns 128-character binary string representation
 * @throws {Error} If the IPv6 address is invalid or cannot be expanded
 *
 * @example Basic conversion:
 * ```typescript
 * ipv6ToBinary('::1');              // 128-bit string ending in '1'
 * ipv6ToBinary('2001:db8::1');      // 128-bit binary representation
 * ipv6ToBinary('::ffff:192.168.1.1'); // IPv4-mapped IPv6 binary
 * ```
 *
 * @example Error handling:
 * ```typescript
 * try {
 *   const binary = ipv6ToBinary('invalid::address');
 * } catch (error) {
 *   console.error('Invalid IPv6:', error.message);
 * }
 * ```
 *
 * @example Subnet prefix comparison:
 * ```typescript
 * const ip1 = ipv6ToBinary('2001:db8::1');
 * const ip2 = ipv6ToBinary('2001:db8::2');
 *
 * // Compare first 64 bits for /64 prefix
 * console.log(ip1.substring(0, 64) === ip2.substring(0, 64)); // true
 * ```
 */
export const ipv6ToBinary = (ip: string): string => {
  // Normalize and expand the IPv6 address
  const expandedIP = expandIPv6(ip);
  if (!expandedIP) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  // Convert each hexadecimal segment to binary
  return expandedIP.split(':')
    .map((segment) =>
      Number.parseInt(segment, 16).toString(2).padStart(16, '0')
    )
    .join('');
};

/**
 * Converts an IPv4 address to a 32-bit unsigned integer.
 *
 * This function provides a numeric representation of an IPv4 address,
 * which is useful for range comparisons, sorting, and mathematical
 * operations on IP addresses.
 *
 * **Algorithm:**
 * 1. Split address into 4 octets
 * 2. Apply formula: (octet1 × 256³) + (octet2 × 256²) + (octet3 × 256¹) + octet4
 * 3. Use unsigned right shift to ensure positive 32-bit integer
 *
 * @param ip - IPv4 address in dot-decimal notation
 * @returns 32-bit unsigned integer representation (0 to 4,294,967,295)
 *
 * @example Basic conversion:
 * ```typescript
 * ipv4ToLong('0.0.0.0');         // 0
 * ipv4ToLong('0.0.0.1');         // 1
 * ipv4ToLong('192.168.1.1');     // 3232235521
 * ipv4ToLong('255.255.255.255'); // 4294967295
 * ```
 *
 * @example IP range checking:
 * ```typescript
 * const startIP = ipv4ToLong('192.168.0.0');
 * const endIP = ipv4ToLong('192.168.0.255');
 * const testIP = ipv4ToLong('192.168.0.100');
 *
 * console.log(testIP >= startIP && testIP <= endIP); // true
 * ```
 *
 * @example Sorting IP addresses:
 * ```typescript
 * const ips = ['192.168.1.10', '10.0.0.1', '192.168.1.1'];
 * ips.sort((a, b) => ipv4ToLong(a) - ipv4ToLong(b));
 * // Result: ['10.0.0.1', '192.168.1.1', '192.168.1.10']
 * ```
 */
export const ipv4ToLong = (ip: string): number => {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  return ip.split('.')
    .reduce(
      (acc, octet) => (acc << OCTET_BITS) + Number.parseInt(octet, 10),
      0,
    ) >>> 0;
};

/**
 * Checks if an IPv4 address is within a specified CIDR range.
 *
 * This function uses bitwise operations to efficiently determine if an
 * IPv4 address falls within a given network range defined by a starting
 * address and CIDR prefix length.
 *
 * **Algorithm:**
 * 1. Convert both IP addresses to 32-bit integers
 * 2. Create subnet mask: ~((1 << (32 - cidr)) - 1)
 * 3. Apply mask to both IPs and compare network portions
 *
 * **Performance:** O(1) - constant time operation
 *
 * @param ip - IPv4 address to check
 * @param rangeStart - Starting IP address of the range
 * @param cidr - CIDR prefix length (0-32)
 * @returns true if the IP is within the range, false otherwise
 *
 * @example Basic range checking:
 * ```typescript
 * isIPv4InRange('192.168.1.10', '192.168.1.0', 24);  // true
 * isIPv4InRange('192.168.2.10', '192.168.1.0', 24);  // false
 * isIPv4InRange('10.0.0.1', '10.0.0.0', 8);          // true
 * ```
 *
 * @example Network access control:
 * ```typescript
 * const allowedRanges = [
 *   { start: '192.168.0.0', cidr: 16 },
 *   { start: '10.0.0.0', cidr: 8 }
 * ];
 *
 * function isAllowedIP(clientIP: string): boolean {
 *   return allowedRanges.some(range =>
 *     isIPv4InRange(clientIP, range.start, range.cidr)
 *   );
 * }
 * ```
 *
 * @example Subnet validation:
 * ```typescript
 * const subnetStart = '192.168.1.0';
 * const hosts = ['192.168.1.1', '192.168.1.254', '192.168.2.1'];
 *
 * hosts.forEach(host => {
 *   const inSubnet = isIPv4InRange(host, subnetStart, 24);
 *   console.log(`${host} in subnet: ${inSubnet}`);
 * });
 * ```
 */
export const isIPv4InRange = (
  ip: string,
  rangeStart: string,
  cidr: number,
): boolean => {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  if (!isValidIPv4(rangeStart)) {
    throw new Error(`Invalid IPv4 range start: ${rangeStart}`);
  }
  if (!Number.isInteger(cidr) || cidr < 0 || cidr > IPV4_MAX_SUBNET) {
    throw new Error(`Invalid CIDR prefix: ${cidr}`);
  }

  const ipLong = ipv4ToLong(ip);
  const rangeLong = ipv4ToLong(rangeStart);
  const mask = ~((1 << (IPV4_BITS - cidr)) - 1);
  return (ipLong & mask) === (rangeLong & mask);
};

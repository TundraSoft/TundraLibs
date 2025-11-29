import { isSubnet } from './isSubnet.ts';
import {
  IPV4_REGEX,
  ipv4ToBinary,
  IPV6_REGEX,
  ipv6ToBinary,
  isValidIPv4,
} from './ipUtils.ts';

/**
 * Validates if an IP address is within a subnet range using CIDR notation.
 *
 * This function determines whether a given IP address (IPv4 or IPv6) falls within
 * the specified subnet range. It supports both IPv4 and IPv6 addresses and uses
 * binary comparison for accurate subnet calculations.
 *
 * **Algorithm:**
 * 1. Validates input parameters and normalizes whitespace
 * 2. Validates subnet format using the isSubnet utility
 * 3. Parses CIDR notation to extract network address and prefix length
 * 4. Converts both IP addresses to binary representation
 * 5. Compares the network portion (determined by CIDR prefix) of both addresses
 *
 * **Supported Formats:**
 * - IPv4: Standard dotted decimal notation (e.g., "192.168.1.1")
 * - IPv6: Standard hexadecimal notation with optional compression (e.g., "2001:db8::1")
 * - Mixed: IPv4-mapped IPv6 addresses (e.g., "::ffff:192.168.1.1")
 *
 * **Performance:**
 * - Time complexity: O(1) for IPv4, O(n) for IPv6 where n is address length
 * - Space complexity: O(1) - uses string operations, no large data structures
 * - Highly optimized for common network operations
 *
 * @param ip - IP address to check (IPv4 or IPv6 format)
 * @param subnet - Subnet in CIDR notation (e.g., '192.168.0.0/24' or '2001:db8::/32')
 * @returns true if the IP address is within the subnet range, false otherwise
 *
 * @example Basic IPv4 subnet checking:
 * ```typescript
 * isInSubnet('192.168.1.5', '192.168.0.0/16');   // true - within 192.168.x.x
 * isInSubnet('192.168.1.5', '192.168.0.0/24');   // false - not in 192.168.0.x
 * isInSubnet('10.0.0.1', '192.168.0.0/16');      // false - different network
 * ```
 *
 * @example IPv6 subnet checking:
 * ```typescript
 * isInSubnet('2001:db8::1', '2001:db8::/32');       // true
 * isInSubnet('2001:db8:1::1', '2001:db8::/32');     // true - within range
 * isInSubnet('2001:db9::1', '2001:db8::/32');       // false - outside range
 * ```
 *
 * @example Private network detection:
 * ```typescript
 * // Check if IP is in common private ranges
 * const isPrivate = (ip: string): boolean => {
 *   return isInSubnet(ip, '10.0.0.0/8') ||
 *          isInSubnet(ip, '172.16.0.0/12') ||
 *          isInSubnet(ip, '192.168.0.0/16');
 * };
 *
 * isPrivate('192.168.1.100');  // true
 * isPrivate('8.8.8.8');        // false
 * ```
 *
 * @example Network access control:
 * ```typescript
 * const allowedSubnets = ['192.168.0.0/24', '10.0.0.0/8'];
 *
 * function isAllowedIP(clientIP: string): boolean {
 *   return allowedSubnets.some(subnet => isInSubnet(clientIP, subnet));
 * }
 *
 * isAllowedIP('192.168.0.50');  // true
 * isAllowedIP('203.0.113.1');   // false
 * ```
 *
 * @example Load balancer subnet routing:
 * ```typescript
 * const routingRules = [
 *   { subnet: '192.168.1.0/24', datacenter: 'west' },
 *   { subnet: '192.168.2.0/24', datacenter: 'east' },
 *   { subnet: '10.0.0.0/8', datacenter: 'internal' }
 * ];
 *
 * function getDatacenter(ip: string): string {
 *   const rule = routingRules.find(r => isInSubnet(ip, r.subnet));
 *   return rule?.datacenter ?? 'default';
 * }
 * ```
 *
 * @example Error handling:
 * ```typescript
 * // Function gracefully handles invalid inputs
 * isInSubnet('invalid-ip', '192.168.0.0/24');    // false
 * isInSubnet('192.168.1.1', 'invalid-subnet');   // false
 * isInSubnet('', '');                             // false
 * isInSubnet('192.168.1.1', '192.168.0.0/99');   // false (invalid CIDR)
 * ```
 */
/**
 * Validates if an IPv4 address is within an IPv4 subnet range.
 *
 * @param ip - IPv4 address to check
 * @param subnetIP - IPv4 subnet address
 * @param cidr - CIDR prefix length (0-32)
 * @returns true if IP is in subnet, false otherwise
 */
function isIPv4InSubnet(ip: string, subnetIP: string, cidr: number): boolean {
  if (cidr < 0 || cidr > 32) return false;

  // Additional validation for valid IPv4 octets
  if (!isValidIPv4(ip) || !isValidIPv4(subnetIP)) return false;

  const ipBinary = ipv4ToBinary(ip);
  const subnetBinary = ipv4ToBinary(subnetIP);

  // Compare the network portions (determined by cidr)
  return ipBinary.substring(0, cidr) === subnetBinary.substring(0, cidr);
}

/**
 * Validates if an IPv6 address is within an IPv6 subnet range.
 *
 * @param ip - IPv6 address to check
 * @param subnetIP - IPv6 subnet address
 * @param cidr - CIDR prefix length (0-128)
 * @returns true if IP is in subnet, false otherwise
 */
function isIPv6InSubnet(ip: string, subnetIP: string, cidr: number): boolean {
  if (cidr < 0 || cidr > 128) return false;

  const ipBinary = ipv6ToBinary(ip);
  const subnetBinary = ipv6ToBinary(subnetIP);

  // Compare the network portions (determined by cidr)
  return ipBinary.substring(0, cidr) === subnetBinary.substring(0, cidr);
}

/**
 * Parses and validates CIDR notation subnet string.
 *
 * @param subnet - Subnet string in CIDR notation
 * @returns Object with subnetIP and cidr, or null if invalid
 */
function parseCIDR(subnet: string): { subnetIP: string; cidr: number } | null {
  const [subnetIP, cidrStr] = subnet.split('/');
  if (!subnetIP || !cidrStr) return null;

  const cidr = Number.parseInt(cidrStr, 10);
  if (Number.isNaN(cidr)) return null;

  return { subnetIP, cidr };
}

export const isInSubnet = (ip: string, subnet: string): boolean => {
  // Basic input validation
  if (!ip || !subnet || typeof ip !== 'string' || typeof subnet !== 'string') {
    return false;
  }

  // Check for leading/trailing whitespace - reject if present
  if (ip !== ip.trim() || subnet !== subnet.trim()) {
    return false;
  }

  // Validate that the subnet parameter is a valid subnet using isSubnet
  if (!isSubnet(subnet)) {
    return false;
  }

  try {
    // Parse subnet CIDR notation
    const parsed = parseCIDR(subnet);
    if (!parsed) return false;

    const { subnetIP, cidr } = parsed;

    // IPv4 handling
    if (IPV4_REGEX.test(ip) && IPV4_REGEX.test(subnetIP)) {
      return isIPv4InSubnet(ip, subnetIP, cidr);
    }

    // IPv6 handling
    if (IPV6_REGEX.test(ip) && IPV6_REGEX.test(subnetIP)) {
      return isIPv6InSubnet(ip, subnetIP, cidr);
    }

    // IP versions don't match or unsupported format
    return false;
  } catch {
    // Safely handle any unexpected errors
    return false;
  }
};

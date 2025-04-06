import {
  expandIPv6,
  IPV4_MAX_SUBNET,
  IPV4_SEGMENT,
  IPV6_MAX_SUBNET,
  IPV6_SEGMENT,
} from './ipUtils.ts';

/**
 * Checks if a given string represents a valid IP subnet in CIDR notation.
 * Supports both IPv4 and IPv6 addresses.
 *
 * @param ip - The IP address in CIDR notation (e.g., "192.168.1.0/24" or "2001:db8::/32")
 * @returns boolean - True if valid subnet, false otherwise
 *
 * @example
 * isSubnet('192.168.1.0/24') // true
 * isSubnet('2001:db8::/32')  // true
 * isSubnet('256.1.2.3/24')   // false
 * isSubnet('192.168.1.1')    // false (no subnet)
 */
export const isSubnet = (ip: string): boolean => {
  if (typeof ip !== 'string') return false;

  const trimmedIp = ip.trim();
  if (!trimmedIp) return false;

  const parts = trimmedIp.split('/');
  if (parts.length !== 2) return false;

  const [addressPart, subnetPart] = parts;
  if (!addressPart || !subnetPart) return false;

  // Check if it's IPv6
  if (addressPart.includes(':')) {
    return isIPv6Subnet(addressPart, parseInt(subnetPart, 10));
  }

  // Otherwise treat as IPv4
  return isIPv4Subnet(addressPart, parseInt(subnetPart, 10));
};

/**
 * Validates IPv4 address and subnet mask
 * @param ip - IPv4 address portion
 * @param subnet - Subnet mask (0-32)
 * @returns boolean - True if valid, false otherwise
 */
const isIPv4Subnet = (ip: string, subnet: number): boolean => {
  // Validate subnet range for IPv4
  if (isNaN(subnet) || subnet < 0 || subnet > IPV4_MAX_SUBNET) {
    return false;
  }

  // Validate IPv4 format
  const segments = ip.split('.');
  if (segments.length !== 4) return false;

  return segments.every((segment) => {
    // Check that each segment is a valid number between 0-255 with no leading zeros
    return IPV4_SEGMENT.test(segment);
  });
};

/**
 * Validates IPv6 address and subnet mask
 * @param ip - IPv6 address portion
 * @param subnet - Subnet mask (0-128)
 * @returns boolean - True if valid, false otherwise
 */
const isIPv6Subnet = (ip: string, subnet: number): boolean => {
  // Validate subnet range for IPv6
  if (isNaN(subnet) || subnet < 0 || subnet > IPV6_MAX_SUBNET) {
    return false;
  }

  // Handle compressed IPv6 notation
  const expandedIP = expandIPv6(ip);
  if (!expandedIP) return false;

  const segments = expandedIP.split(':');
  if (segments.length !== 8) return false;

  return segments.every((segment) => {
    // Each segment should be a valid 16-bit hexadecimal
    return IPV6_SEGMENT.test(segment);
  });
};

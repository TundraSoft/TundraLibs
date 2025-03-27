// Constants for subnet validation
const IPV4_MAX_SUBNET = 32;
const IPV6_MAX_SUBNET = 128;

// Pre-compiled regex patterns for IPv4 and IPv6 validation
const IPV4_SEGMENT = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;
const IPV6_SEGMENT = /^[0-9A-Fa-f]{1,4}$/;

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

/**
 * Expands compressed IPv6 address to full form
 * @param ip - IPv6 address, potentially compressed
 * @returns string | null - Full form IPv6 address or null if invalid
 */
const expandIPv6 = (ip: string): string | null => {
  // Handle empty or invalid input
  if (!ip) return null;

  // Count number of colons
  const colonCount = (ip.match(/:/g) || []).length;
  if (colonCount > 7) return null;

  // Handle compressed notation
  if (ip.includes('::')) {
    if ((ip.match(/::/g) || []).length > 1) return null; // Multiple :: not allowed

    const parts = ip.split('::');
    if (parts.length !== 2) return null;

    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);

    if (missing <= 0) return null;

    return [...left, ...Array(missing).fill('0'), ...right].join(':');
  }

  // Handle full notation
  const parts = ip.split(':');
  return parts.length === 8 ? ip : null;
};

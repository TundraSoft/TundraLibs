import { isSubnet } from './isSubnet.ts';

// Pre-compiled regex patterns for better performance
const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;

/**
 * Converts an IPv4 address to its binary representation
 * @param ip - IPv4 address in dot-decimal notation
 * @returns Binary string representation of the IP
 */
const ipv4ToBinary = (ip: string): string => {
  return ip.split('.')
    .map((part) => parseInt(part, 10).toString(2).padStart(8, '0'))
    .join('');
};

/**
 * Converts an IPv6 address to its binary representation
 * @param ip - IPv6 address
 * @returns Binary string representation of the IP
 */
const ipv6ToBinary = (ip: string): string => {
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
 * Expands compressed IPv6 notation to full form
 * @param ip - IPv6 address, potentially compressed
 * @returns Expanded IPv6 address or null if invalid
 */
const expandIPv6 = (ip: string): string | null => {
  // Handle empty input
  if (!ip) return null;

  // Normalize the address to lowercase
  const normalizedIP = ip.toLowerCase();

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

  return parts.join(':');
};

/**
 * Validates that an IPv4 address has valid octets (0-255)
 * @param ip - IPv4 address to validate
 * @returns true if all octets are valid
 */
const isValidIPv4 = (ip: string): boolean => {
  return ip.split('.').every((octet) => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
};

/**
 * Validates if an IP address is within a subnet range
 *
 * @param ip - IP address to check (IPv4 or IPv6)
 * @param subnet - Subnet in CIDR notation (e.g., '192.168.0.0/24' or '2001:db8::/32')
 * @returns true if the IP is in the subnet range, false otherwise
 *
 * @example
 * isInSubnet('192.168.1.5', '192.168.0.0/16') // true
 * isInSubnet('192.169.1.5', '192.168.0.0/16') // false
 * isInSubnet('2001:db8::1', '2001:db8::/32') // true
 */
export const isInSubnet = (ip: string, subnet: string): boolean => {
  // Basic input validation
  if (!ip || !subnet || typeof ip !== 'string' || typeof subnet !== 'string') {
    return false;
  }
  ip = ip.trim();
  subnet = subnet.trim();

  // Validate that the subnet parameter is a valid subnet using isSubnet
  if (!isSubnet(subnet)) {
    return false;
  }

  try {
    // Parse subnet CIDR notation
    const [subnetIP, cidrStr] = subnet.split('/');
    if (!subnetIP || !cidrStr) return false;

    const cidr = parseInt(cidrStr, 10);
    if (isNaN(cidr)) return false;

    // IPv4 handling
    if (ipv4Regex.test(ip) && ipv4Regex.test(subnetIP)) {
      if (cidr < 0 || cidr > 32) return false;

      // Additional validation for valid IPv4 octets
      if (!isValidIPv4(ip) || !isValidIPv4(subnetIP)) return false;

      const ipBinary = ipv4ToBinary(ip);
      const subnetBinary = ipv4ToBinary(subnetIP);

      // Compare the network portions (determined by cidr)
      return ipBinary.substring(0, cidr) === subnetBinary.substring(0, cidr);
    }

    // IPv6 handling
    if (ipv6Regex.test(ip) && ipv6Regex.test(subnetIP)) {
      if (cidr < 0 || cidr > 128) return false;

      const ipBinary = ipv6ToBinary(ip);
      const subnetBinary = ipv6ToBinary(subnetIP);

      // Compare the network portions (determined by cidr)
      return ipBinary.substring(0, cidr) === subnetBinary.substring(0, cidr);
    }

    // IP versions don't match or unsupported format
    return false;
  } catch (error) {
    // Safely handle any unexpected errors
    console.debug(
      `Error in isInSubnet: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
};

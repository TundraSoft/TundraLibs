import { isSubnet } from './isSubnet.ts';
import {
  IPV4_REGEX,
  ipv4ToBinary,
  IPV6_REGEX,
  ipv6ToBinary,
  isValidIPv4,
} from './ipUtils.ts';

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
    if (IPV4_REGEX.test(ip) && IPV4_REGEX.test(subnetIP)) {
      if (cidr < 0 || cidr > 32) return false;

      // Additional validation for valid IPv4 octets
      if (!isValidIPv4(ip) || !isValidIPv4(subnetIP)) return false;

      const ipBinary = ipv4ToBinary(ip);
      const subnetBinary = ipv4ToBinary(subnetIP);

      // Compare the network portions (determined by cidr)
      return ipBinary.substring(0, cidr) === subnetBinary.substring(0, cidr);
    }

    // IPv6 handling
    if (IPV6_REGEX.test(ip) && IPV6_REGEX.test(subnetIP)) {
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

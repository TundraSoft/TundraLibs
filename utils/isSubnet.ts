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

  const [addressPart, subnetPart, ...excess] = trimmedIp.split('/');
  if (excess && excess.length > 0) return false;
  if (!addressPart || !subnetPart) return false;

  // Check if it's IPv6
  if (addressPart.includes(':')) {
    return isIPv6Subnet(addressPart, parseInt(subnetPart));
  }

  // Otherwise treat as IPv4
  return isIPv4Subnet(addressPart, parseInt(subnetPart));
};

/**
 * Validates IPv4 address and subnet mask
 */
const isIPv4Subnet = (ip: string, subnet: number): boolean => {
  // Validate subnet range for IPv4
  if (isNaN(subnet) || subnet < 0 || subnet > 32) {
    return false;
  }

  // Validate IPv4 format
  const segments = ip.split('.');
  if (segments.length !== 4) return false;

  return segments.every((segment) => {
    const num = parseInt(segment, 10);
    return !isNaN(num) && num >= 0 && num <= 255 &&
      segment === num.toString(); // Ensures no leading zeros or invalid chars
  });
};

/**
 * Validates IPv6 address and subnet mask
 */
const isIPv6Subnet = (ip: string, subnet: number): boolean => {
  // Validate subnet range for IPv6
  if (isNaN(subnet) || subnet < 0 || subnet > 128) {
    return false;
  }

  // Handle compressed IPv6 notation
  const expandedIP = expandIPv6(ip);
  if (!expandedIP) return false;

  const segments = expandedIP.split(':');
  if (segments.length !== 8) return false;

  return segments.every((segment) => {
    // Each segment should be a valid 16-bit hexadecimal
    return /^[0-9A-Fa-f]{1,4}$/.test(segment);
  });
};

/**
 * Expands compressed IPv6 address
 */
const expandIPv6 = (ip: string): string | null => {
  // Handle empty or invalid input
  if (!ip) return null;

  // Count number of colons
  const colonCount = (ip.match(/:/g) || []).length;
  if (colonCount > 7) return null;

  // Handle compressed notation
  if (ip.includes('::')) {
    if ((ip.match(/::/g) || []).length > 1) return null;

    const parts = ip.split('::');
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);

    if (missing < 0) return null;

    return [...left, ...Array(missing).fill('0'), ...right].join(':');
  }

  // Handle full notation
  const parts = ip.split(':');
  return parts.length === 8 ? ip : null;
};

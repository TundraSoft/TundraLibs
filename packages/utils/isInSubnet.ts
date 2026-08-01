/**
 * @fileoverview `isInSubnet(ip, cidr)` — true iff `ip` falls inside
 * `cidr` (e.g. `'192.168.0.0/16'`). Works for IPv4, IPv6, and mixed
 * forms by comparing the leading `prefix` bits of the binary
 * encodings.
 *
 * @module
 */

import { isSubnet } from './isSubnet.ts';
import {
  IPV4_REGEX,
  ipv4ToBinary,
  IPV6_REGEX,
  ipv6ToBinary,
  isValidIPv4,
} from './ipUtils.ts';

function isIPv4InSubnet(ip: string, subnetIP: string, cidr: number): boolean {
  if (cidr < 0 || cidr > 32) return false;

  // Additional validation for valid IPv4 octets
  if (!isValidIPv4(ip) || !isValidIPv4(subnetIP)) return false;

  const ipBinary = ipv4ToBinary(ip);
  const subnetBinary = ipv4ToBinary(subnetIP);

  return ipBinary.substring(0, cidr) === subnetBinary.substring(0, cidr);
}

function isIPv6InSubnet(ip: string, subnetIP: string, cidr: number): boolean {
  if (cidr < 0 || cidr > 128) return false;

  const ipBinary = ipv6ToBinary(ip);
  const subnetBinary = ipv6ToBinary(subnetIP);

  return ipBinary.substring(0, cidr) === subnetBinary.substring(0, cidr);
}

function parseCIDR(subnet: string): { subnetIP: string; cidr: number } | null {
  const [subnetIP, cidrStr] = subnet.split('/');
  if (!subnetIP || !cidrStr) return null;

  const cidr = Number.parseInt(cidrStr, 10);
  if (Number.isNaN(cidr)) return null;

  return { subnetIP, cidr };
}

/**
 * Whether `ip` belongs to the CIDR `subnet`.
 * Returns `false` (never throws) for any malformed input — including
 * invalid IPs, bad CIDR, version mismatches, leading whitespace, etc.
 *
 * @example
 * ```typescript
 * isInSubnet('192.168.1.5',  '192.168.0.0/16'); // true
 * isInSubnet('2001:db8::1',  '2001:db8::/32');  // true
 * isInSubnet('10.0.0.1',     '192.168.0.0/16'); // false
 * ```
 */
export const isInSubnet = (ip: string, subnet: string): boolean => {
  if (!ip || !subnet || typeof ip !== 'string' || typeof subnet !== 'string') {
    return false;
  }
  if (ip !== ip.trim() || subnet !== subnet.trim()) {
    return false;
  }
  if (!isSubnet(subnet)) {
    return false;
  }

  try {
    const parsed = parseCIDR(subnet);
    if (!parsed) return false;
    const { subnetIP, cidr } = parsed;

    if (IPV4_REGEX.test(ip) && IPV4_REGEX.test(subnetIP)) {
      return isIPv4InSubnet(ip, subnetIP, cidr);
    }
    if (IPV6_REGEX.test(ip) && IPV6_REGEX.test(subnetIP)) {
      return isIPv6InSubnet(ip, subnetIP, cidr);
    }
    return false;
  } catch {
    return false;
  }
};

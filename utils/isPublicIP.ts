const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;

const ipv4Ranges = [
  ['10.0.0.0', 8], // Private network
  ['172.16.0.0', 12], // Private network
  ['192.168.0.0', 16], // Private network
  ['169.254.0.0', 16], // Link-local
  ['127.0.0.0', 8], // Localhost
  ['0.0.0.0', 8], // Current network
];

const ipv6Ranges = [
  ['fc00::', 7], // Unique local address
  ['fe80::', 10], // Link-local address
];

const ipToLong = (ip: string): number => {
  return ip.split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
};

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

export const isPublicIP = (ip: string): boolean => {
  if (!ip || typeof ip !== 'string') return false;

  // IPv4 check
  if (ipv4Regex.test(ip)) {
    return !ipv4Ranges.some(([range, cidr]) =>
      isIPv4InRange(ip, range as string, cidr as number)
    );
  }

  // IPv6 check
  if (ipv6Regex.test(ip)) {
    const normalizedIP = ip.toLowerCase();
    if (normalizedIP === '::1') return false; // localhost
    return !ipv6Ranges.some(([prefix, _]) =>
      normalizedIP.startsWith(prefix as string)
    );
  }

  return false;
};

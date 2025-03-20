const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;

const ipv4ToBinary = (ip: string): string => {
  return ip.split('.')
    .map((part) => parseInt(part, 10).toString(2).padStart(8, '0'))
    .join('');
};

const ipv6ToBinary = (ip: string): string => {
  const normalized = ip.toLowerCase().split(':').map((segment) =>
    segment.padStart(4, '0')
  ).join('');

  return Array.from(normalized)
    .map((char) => parseInt(char, 16).toString(2).padStart(4, '0'))
    .join('');
};

export const isInSubnet = (ip: string, subnet: string): boolean => {
  try {
    if (!ip || !subnet) return false;

    const [subnetIP, mask] = subnet.split('/');
    if (!subnetIP || !mask) return false;

    const maskNum = parseInt(mask, 10);
    if (isNaN(maskNum)) return false;

    // IPv4 handling
    if (ipv4Regex.test(ip) && ipv4Regex.test(subnetIP)) {
      if (maskNum < 0 || maskNum > 32) return false;
      const ipBinary = ipv4ToBinary(ip);
      const subnetBinary = ipv4ToBinary(subnetIP);
      return ipBinary.slice(0, maskNum) === subnetBinary.slice(0, maskNum);
    }

    // IPv6 handling
    if (ipv6Regex.test(ip) && ipv6Regex.test(subnetIP)) {
      if (maskNum < 0 || maskNum > 128) return false;
      const ipBinary = ipv6ToBinary(ip);
      const subnetBinary = ipv6ToBinary(subnetIP);
      return ipBinary.slice(0, maskNum) === subnetBinary.slice(0, maskNum);
    }

    return false;
  } catch {
    return false;
  }
};

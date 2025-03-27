import { isInSubnet } from './isInSubnet.ts';

const subnets: Record<string, string> = {
  '192.168.1.5': '192.168.0.0/16',
  '10.10.10.10': '10.0.0.0/8',
  '172.16.1.1': '172.16.0.0/12',
  '2001:db8::1': '2001:db8::/32',
  'fe80::1:2:3:4': 'fe80::/10',
  '2001:0db8:85a3::8a2e:0370:7334': '2001:0db8:85a3::/64',
};

Object.entries(subnets).forEach(([ip, subnet]) => {
  Deno.bench({
    name: `utils.isInSubnet ${ip} in ${subnet}`,
  }, () => {
    isInSubnet(ip, subnet);
  });
});

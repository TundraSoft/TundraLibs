import { isSubnet } from './isSubnet.ts';

const subnets: string[] = [
  '192.168.1.0/24',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '255.255.255.255/32',
  '2001:db8::/32',
  'fe80::/10',
  '::1/128',
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334/64',
];

for (const subnet of subnets) {
  Deno.bench({
    name: `utils.isSubnet - ${subnet}`,
  }, () => {
    isSubnet(subnet);
  });
}

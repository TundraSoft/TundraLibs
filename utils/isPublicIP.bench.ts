import { isPublicIP } from './isPublicIP.ts';

const ips: string[] = [
  '8.8.8.8',
  '1.1.1.2',
  '203.0.113.1',
  '192.168.1.1',
  '10.1.1.1',
  '127.0.0.1',
  '1.1.2.2',
  '2001:4860:4860::8888',
  '2606:4700:4700::1111',
  'fe80::1',
  'fc00::1',
  '::1',
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  '2001:0db8:85a3::8a2e:0370:7334',
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
];

Deno.bench({
  name: 'utils/isPublicIP - Check public ip addresses',
}, () => {
  isPublicIP(ips[Math.floor(Math.random() * ips.length)]!);
});

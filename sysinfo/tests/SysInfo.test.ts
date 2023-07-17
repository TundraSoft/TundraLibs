import { assertAlmostEquals, assertEquals } from '../../dev.dependencies.ts';
import { SysInfo } from '../SysInfo.ts';
// Deno tests

Deno.test({
  name: `[library='SysInfo' method='getVendor'] Return the vendor name`,
}, () => {
  const vendor = SysInfo.getVendor();
  assertEquals(vendor, Deno.build.vendor);
});

Deno.test({
  name:
    `[library='SysInfo' method='getArch'] Return the architecture (x86_64, x86 etc)`,
}, () => {
  const arch = SysInfo.getArch();
  assertEquals(arch, Deno.build.arch);
});

Deno.test({
  name: `[library='SysInfo' method='getArch'] Return the OS Name`,
}, () => {
  const os = SysInfo.getOs(),
    osNames = [
      'windows',
      'darwin',
      'linux',
      'freebsd',
      'netbsd',
      'aix',
      'solaris',
      'illumos',
    ];
  assertEquals(os, Deno.build.os);
  assertEquals(osNames.includes(os), true);
});

Deno.test({
  name:
    `[library='SysInfo' method='getMemoryInfo'] Return the memory info. Convert to correct size if requested`,
  permissions: { sys: ['systemMemoryInfo'] },
}, async () => {
  const memoryInfo = await SysInfo.getMemoryInfo(),
    memGB = await SysInfo.getMemoryInfo('GB');
  assertEquals(memoryInfo.total > -1, true);
  assertEquals(memoryInfo.free > -1, true);
  assertEquals(memoryInfo.available > -1, true);
  assertEquals(memoryInfo.swap.total > -1, true);
  assertEquals(memoryInfo.swap.free > -1, true);
  // Check if the GB conversion is working
  assertAlmostEquals(
    memGB.total,
    Math.round(memoryInfo.total / 1024 / 1024 / 1024),
  );
  assertAlmostEquals(
    memGB.free,
    Math.round(memoryInfo.free / 1024 / 1024 / 1024),
  );
  assertAlmostEquals(
    memGB.available,
    Math.round(memoryInfo.available / 1024 / 1024 / 1024),
  );
  assertAlmostEquals(
    memGB.swap.total,
    Math.round(memoryInfo.swap.total / 1024 / 1024 / 1024),
  );
  assertAlmostEquals(
    memGB.swap.free,
    Math.round(memoryInfo.swap.free / 1024 / 1024 / 1024),
  );
});

Deno.test({
  name:
    `[library='SysInfo' method='getMemoryInfo'] Return values as 0 if permission is not provided`,
  permissions: { sys: false },
}, async () => {
  const memoryInfo = await SysInfo.getMemoryInfo();
  assertEquals(memoryInfo.total, 0);
  assertEquals(memoryInfo.free, 0);
  assertEquals(memoryInfo.available, 0);
  assertEquals(memoryInfo.swap.total, 0);
  assertEquals(memoryInfo.swap.free, 0);
});

Deno.test({
  name: `[library='SysInfo' method='getPid'] getPid returns PID`,
}, () => {
  const pid = SysInfo.getPid();
  assertEquals(pid, Deno.pid);
});

Deno.test({
  name: `[library='SysInfo' method='getLoadAverage'] Returns load average`,
  permissions: { sys: ['loadavg'] },
}, async () => {
  const loadAverage = await SysInfo.getLoadAverage();
  assertEquals(loadAverage, Deno.loadavg());
});

Deno.test({
  name:
    `[library='SysInfo' method='getLoadAverage'] Returns empty array if permission as not set`,
  permissions: { sys: false },
}, async () => {
  const loadAverage = await SysInfo.getLoadAverage();
  assertEquals(loadAverage, []);
  assertEquals(loadAverage?.length, 0);
});

Deno.test({
  name: `[library='SysInfo' method='getHostname'] Returns hostname`,
  permissions: { sys: ['hostname'] },
}, async () => {
  const hostname = await SysInfo.getHostname();
  assertEquals(hostname, Deno.hostname());
});

Deno.test({
  name:
    `[library='SysInfo' method='getHostname'] Returns undefined as permission is not set`,
  permissions: { sys: false },
}, async () => {
  const hostname = await SysInfo.getHostname();
  assertEquals(hostname, undefined);
});

Deno.test({
  name: `[library='SysInfo' method='getIP'] Returns IP Addresses`,
  permissions: { sys: ['networkInterfaces'] },
}, async () => {
  const ipAddresses = await SysInfo.getIP();
  assertEquals(Array.isArray(ipAddresses), true);
});

Deno.test({
  name: `[library='SysInfo' method='getIP'] Returns only public IP Addresses`,
  permissions: { sys: ['networkInterfaces'] },
}, async () => {
  const ipAddresses = await SysInfo.getIP(true);
  const isPublivIp = function (address: string): boolean {
    const ipv4 =
        /(^192\.168\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^172\.([1][6-9]|[2][0-9]|[3][0-1])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^10\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)/,
      ipv6 = /(^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$)/;
    return ipv4.test(address) || ipv6.test(address);
  };
  for (const ipAddress of ipAddresses) {
    assertEquals(isPublivIp(ipAddress), true);
  }
});

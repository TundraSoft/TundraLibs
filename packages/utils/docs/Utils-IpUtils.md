# IP Utils - IPv4 and IPv6 Utilities

## Overview

The `ipUtils` module provides comprehensive utilities for working with IPv4 and IPv6 addresses. It includes:

- **Validation**: Check IP address format and structure
- **Conversion**: Transform IPs between different representations (binary, hex, numeric)
- **Expansion**: Convert compressed IPv6 to full form
- **Range Checking**: Determine if IPs fall within CIDR ranges
- **Binary Operations**: Work with IP addresses at the bit level

These utilities are essential for network programming, security rules, access control, and IP address management.

## Constants

### Regular Expressions

#### `IPV4_REGEX`

Matches valid IPv4 address format (dotted decimal notation).

```typescript
const IPV4_REGEX: RegExp; // /^(\d{1,3}\.){3}\d{1,3}$/
```

#### `IPV6_REGEX`

Basic IPv6 character validation (hex digits, colons, dots).

```typescript
const IPV6_REGEX: RegExp; // /^[0-9a-fA-F:.]+$/
```

#### `IPV4_SEGMENT`

Validates individual IPv4 octets (0-255).

```typescript
const IPV4_SEGMENT: RegExp; // /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
```

#### `IPV6_SEGMENT`

Validates individual IPv6 hexadecimal segments (1-4 hex digits).

```typescript
const IPV6_SEGMENT: RegExp; // /^[0-9A-Fa-f]{1,4}$/
```

### Subnet Masks

- `IPV4_MAX_SUBNET: 32` - Maximum CIDR mask for IPv4
- `IPV6_MAX_SUBNET: 128` - Maximum CIDR mask for IPv6

### Bit Constants

- `IPV4_BITS: 32` - Total bits in IPv4 address
- `IPV6_BITS: 128` - Total bits in IPv6 address
- `OCTET_BITS: 8` - Bits per IPv4 octet
- `IPV6_SEGMENT_BITS: 16` - Bits per IPv6 segment

## API

### Validation Functions

#### `isValidIPv4(ip: string): boolean`

Validates if a string is a properly formatted IPv4 address with octets in range 0-255.

```typescript
isValidIPv4('192.168.1.1'); // true
isValidIPv4('255.255.255.0'); // true
isValidIPv4('256.1.1.1'); // false (octet > 255)
isValidIPv4('192.168.1'); // false (incomplete)
```

#### `isValidIPv6Structure(ip: string): boolean`

Validates IPv6 address structure including compression, IPv4-mapped, and mixed notation.

```typescript
isValidIPv6Structure('2001:db8::1'); // true
isValidIPv6Structure('::1'); // true (loopback)
isValidIPv6Structure('::ffff:192.168.1.1'); // true (IPv4-mapped)
isValidIPv6Structure('fe80::'); // true (compressed)
isValidIPv6Structure('gggg::1'); // false (invalid hex)
```

### Conversion Functions

#### `expandIPv6(ip: string): string | null`

Expands any valid IPv6 form (compressed, full, or with a trailing dotted IPv4
part) to the canonical 8-group form. Groups are not zero-padded. The `::`
zero-fill is placed exactly where the token appears, so mixed forms with hex
groups on both sides of `::` expand correctly. Returns `null` for invalid
input — including a bare IPv4 address or a leading single colon — rather than
throwing.

```typescript
expandIPv6('2001:db8::1');
// Returns: '2001:db8:0:0:0:0:0:1'

expandIPv6('::1');
// Returns: '0:0:0:0:0:0:0:1'

expandIPv6('::ffff:192.168.1.1');
// Returns: '0:0:0:0:0:ffff:c0a8:101'

expandIPv6('64:ff9b::1:1.2.3.4'); // hex groups on both sides of ::
// Returns: '64:ff9b:0:0:0:1:102:304'

expandIPv6('192.168.1.1'); // bare IPv4 is not IPv6
// Returns: null

expandIPv6(':ffff:1.2.3.4'); // leading single colon is not valid IPv6
// Returns: null

expandIPv6('invalid');
// Returns: null
```

#### `ipv4ToBinary(ip: string): string`

Converts IPv4 address to 32-bit binary string representation.

```typescript
ipv4ToBinary('192.168.1.1');
// Returns: '11000000101010000000000100000001'

ipv4ToBinary('255.255.255.0');
// Returns: '11111111111111111111111100000000'

ipv4ToBinary('10.0.0.1');
// Returns: '00001010000000000000000000000001'
```

#### `ipv6ToBinary(ip: string): string`

Converts IPv6 address to 128-bit binary string representation.

```typescript
ipv6ToBinary('2001:db8::1');
// Returns: '00100000000000010000110110111000...' (128 bits)

ipv6ToBinary('::1');
// Returns: '00000000000000000000000000000000...' (127 zeros + '1')
```

#### `ipv4ToLong(ip: string): number`

Converts IPv4 address to 32-bit unsigned integer.

```typescript
ipv4ToLong('192.168.1.1'); // Returns: 3232235777
ipv4ToLong('10.0.0.1'); // Returns: 167772161
ipv4ToLong('0.0.0.0'); // Returns: 0
ipv4ToLong('255.255.255.255'); // Returns: 4294967295
```

Useful for sorting IPs numerically:

```typescript
const ips = ['192.168.1.10', '192.168.1.1', '10.0.0.1'];
ips.sort((a, b) => ipv4ToLong(a) - ipv4ToLong(b));
// Result: ['10.0.0.1', '192.168.1.1', '192.168.1.10']
```

#### `ipv4ToHexSegments(ipv4: string): string[]`

Converts IPv4 to hexadecimal segments for IPv6-mapped addresses.

```typescript
ipv4ToHexSegments('192.168.1.1');
// Returns: ['c0a8', '0101']

// Use for creating IPv6-mapped address:
const segments = ipv4ToHexSegments('192.168.1.1');
const ipv6Mapped = `::ffff:${segments[0]}:${segments[1]}`;
// Result: '::ffff:c0a8:0101'
```

### Range Checking

#### `isIPv4InRange(ip: string, cidr: string, mask: number): boolean`

Checks if IPv4 address falls within a CIDR range using efficient bitwise operations.

```typescript
isIPv4InRange('192.168.1.10', '192.168.0.0', 16); // true
isIPv4InRange('192.168.1.10', '192.168.1.0', 24); // true
isIPv4InRange('10.0.0.1', '192.168.0.0', 16); // false
isIPv4InRange('192.169.1.1', '192.168.0.0', 16); // false
```

## Usage Examples

### Network Address Validation

```typescript
import { isValidIPv4, isValidIPv6Structure } from '@tundralibs/utils';

function validateIPAddress(ip: string): 'IPv4' | 'IPv6' | 'Invalid' {
  if (isValidIPv4(ip)) return 'IPv4';
  if (isValidIPv6Structure(ip)) return 'IPv6';
  return 'Invalid';
}

console.log(validateIPAddress('192.168.1.1')); // 'IPv4'
console.log(validateIPAddress('2001:db8::1')); // 'IPv6'
console.log(validateIPAddress('invalid')); // 'Invalid'
```

### Subnet Membership Check

```typescript
import { ipv4ToBinary } from '@tundralibs/utils';

function isInSubnet(ip: string, subnet: string, mask: number): boolean {
  const ipBinary = ipv4ToBinary(ip);
  const subnetBinary = ipv4ToBinary(subnet);

  return ipBinary.substring(0, mask) === subnetBinary.substring(0, mask);
}

isInSubnet('192.168.1.10', '192.168.0.0', 16); // true
isInSubnet('10.0.0.1', '192.168.0.0', 16); // false
```

### IP Address Sorting

```typescript
import { ipv4ToLong } from '@tundralibs/utils';

const serverIPs = [
  '192.168.1.100',
  '192.168.1.10',
  '192.168.1.1',
  '10.0.0.1',
];

// Sort numerically
const sorted = serverIPs.sort((a, b) => ipv4ToLong(a) - ipv4ToLong(b));
// ['10.0.0.1', '192.168.1.1', '192.168.1.10', '192.168.1.100']
```

### IPv6 Address Normalization

```typescript
import { expandIPv6, isValidIPv6Structure } from '@tundralibs/utils';

function normalizeIPv6(ip: string): string | null {
  if (!isValidIPv6Structure(ip)) {
    return null;
  }
  return expandIPv6(ip);
}

normalizeIPv6('2001:db8::1');
// '2001:db8:0:0:0:0:0:1'

normalizeIPv6('::1');
// '0:0:0:0:0:0:0:1'
```

### IPv4-Mapped IPv6 Addresses

```typescript
import { ipv4ToHexSegments, isValidIPv4 } from '@tundralibs/utils';

function ipv4ToIPv6Mapped(ipv4: string): string | null {
  if (!isValidIPv4(ipv4)) return null;

  const hexSegments = ipv4ToHexSegments(ipv4);
  return `::ffff:${hexSegments[0]}:${hexSegments[1]}`;
}

ipv4ToIPv6Mapped('192.168.1.1'); // '::ffff:c0a8:0101'
ipv4ToIPv6Mapped('10.0.0.1'); // '::ffff:0a00:0001'
```

### Network Range Calculator

```typescript
import { ipv4ToLong, isIPv4InRange } from '@tundralibs/utils';

function getNetworkRange(network: string, mask: number) {
  const networkLong = ipv4ToLong(network);
  const hostBits = 32 - mask;
  const totalHosts = Math.pow(2, hostBits);

  return {
    network,
    mask,
    firstIP: longToIPv4(networkLong + 1),
    lastIP: longToIPv4(networkLong + totalHosts - 2),
    broadcast: longToIPv4(networkLong + totalHosts - 1),
    totalHosts: totalHosts - 2, // Exclude network and broadcast
  };
}

function longToIPv4(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

const range = getNetworkRange('192.168.1.0', 24);
// {
//   network: '192.168.1.0',
//   mask: 24,
//   firstIP: '192.168.1.1',
//   lastIP: '192.168.1.254',
//   broadcast: '192.168.1.255',
//   totalHosts: 254
// }
```

### Firewall Rule Matcher

```typescript
import { isIPv4InRange } from '@tundralibs/utils';

interface FirewallRule {
  name: string;
  network: string;
  mask: number;
  action: 'allow' | 'deny';
}

function checkFirewallRules(ip: string, rules: FirewallRule[]): string {
  for (const rule of rules) {
    if (isIPv4InRange(ip, rule.network, rule.mask)) {
      return `${rule.action} (matched ${rule.name})`;
    }
  }
  return 'deny (no match)';
}

const rules: FirewallRule[] = [
  {
    name: 'Internal Network',
    network: '192.168.0.0',
    mask: 16,
    action: 'allow',
  },
  { name: 'DMZ', network: '10.0.0.0', mask: 8, action: 'allow' },
  { name: 'Blocked Range', network: '172.16.0.0', mask: 12, action: 'deny' },
];

checkFirewallRules('192.168.1.10', rules); // 'allow (matched Internal Network)'
checkFirewallRules('172.16.1.1', rules); // 'deny (matched Blocked Range)'
checkFirewallRules('8.8.8.8', rules); // 'deny (no match)'
```

### Binary Subnet Comparison

```typescript
import { ipv4ToBinary, ipv6ToBinary } from '@tundralibs/utils';

function compareSubnets(
  ip1: string,
  ip2: string,
  mask: number,
  isIPv6 = false,
): boolean {
  const binary1 = isIPv6 ? ipv6ToBinary(ip1) : ipv4ToBinary(ip1);
  const binary2 = isIPv6 ? ipv6ToBinary(ip2) : ipv4ToBinary(ip2);

  return binary1.substring(0, mask) === binary2.substring(0, mask);
}

// IPv4
compareSubnets('192.168.1.10', '192.168.1.20', 24); // true (same /24)
compareSubnets('192.168.1.10', '192.168.2.10', 24); // false (different /24)

// IPv6
compareSubnets('2001:db8::1', '2001:db8::2', 64, true); // true (same /64)
compareSubnets('2001:db8::1', '2001:db9::1', 64, true); // false (different /64)
```

## Best Practices

### Do's

✅ **Validate before converting:**

```typescript
if (isValidIPv4(ip)) {
  const binary = ipv4ToBinary(ip);
  // ... use binary
}
```

✅ **Use constants instead of magic numbers:**

```typescript
import { IPV4_BITS, IPV6_BITS } from '@tundralibs/utils';

if (mask > 0 && mask <= IPV4_BITS) {
  // Valid IPv4 mask
}
```

✅ **Normalize IPv6 before comparing:**

```typescript
const normalized1 = expandIPv6(ip1);
const normalized2 = expandIPv6(ip2);
if (normalized1 === normalized2) {
  // Same address
}
```

✅ **Use binary operations for subnet checks:**

```typescript
// Efficient bit-level comparison
const inRange = isIPv4InRange(ip, network, mask);
```

### Don'ts

❌ **Don't convert without validation:**

```typescript
// BAD: Could throw or return garbage
const binary = ipv4ToBinary(userInput);

// GOOD: Validate first
if (isValidIPv4(userInput)) {
  const binary = ipv4ToBinary(userInput);
}
```

❌ **Don't compare compressed IPv6 directly:**

```typescript
// BAD: '2001:db8::1' !== '2001:0db8::0001'
if (ip1 === ip2) {}

// GOOD: Normalize first
if (expandIPv6(ip1) === expandIPv6(ip2)) {}
```

❌ **Don't use string operations for ranges:**

```typescript
// BAD: String comparison doesn't work for IPs
if (ip >= '192.168.0.0' && ip <= '192.168.255.255') {}

// GOOD: Use proper range checking
if (isIPv4InRange(ip, '192.168.0.0', 16)) {}
```

## Performance Considerations

- **Validation**: O(1) regex matching, ~1-2μs per call
- **Binary Conversion**: O(n) where n is address segments, ~5-10μs for IPv4, ~20-30μs for IPv6
- **Range Checking**: O(1) bitwise operations, ~3-5μs per check
- **Expansion**: O(1) for IPv6, ~15-20μs

For high-performance scenarios:

- Cache validation results for frequently checked IPs
- Use `isIPv4InRange` instead of binary string comparison
- Pre-normalize IPv6 addresses in data structures

## Common Use Cases

| Use Case          | Functions                             | Example                 |
| ----------------- | ------------------------------------- | ----------------------- |
| Firewall Rules    | `isIPv4InRange`, `isValidIPv4`        | ACL, security groups    |
| Load Balancing    | `ipv4ToLong`, sorting                 | Consistent hashing      |
| Network Discovery | `isValidIPv4`, `isValidIPv6Structure` | IP scanning             |
| Subnet Planning   | `ipv4ToBinary`, `ipv4ToLong`          | CIDR calculations       |
| IPv6 Migration    | `expandIPv6`, `ipv4ToHexSegments`     | Dual-stack support      |
| Access Control    | `isIPv4InRange`                       | Geographic restrictions |

## Related

- [Is In Subnet](./Utils-IsInSubnet.md) - High-level subnet membership checking
- [Is Public IP](./Utils-IsPublicIP.md) - Detect public vs private addresses
- [Is Subnet](./Utils-IsSubnet.md) - CIDR notation validation
- [Get Free Port](./Utils-GetFreePort.md) - Network port allocation

# Is In Subnet - Subnet Membership Validation

## Overview

The `isInSubnet` utility determines whether an IP address belongs to a specific subnet range using CIDR notation. It supports:

- **IPv4 Subnets**: Standard dotted decimal with /0-/32 masks
- **IPv6 Subnets**: Full and compressed notation with /0-/128 masks
- **Binary Precision**: Bit-level comparison for accurate results
- **Comprehensive Validation**: Validates both IP and subnet format

This is essential for network security, access control, routing decisions, and infrastructure management.

## API

### `isInSubnet(ip: string, cidr: string): boolean`

Checks if an IP address is within a subnet range specified in CIDR notation.

**Parameters:**

- `ip` (string): IPv4 or IPv6 address to check
- `cidr` (string): Subnet in CIDR notation (e.g., '192.168.0.0/16' or '2001:db8::/32')

**Returns:** `boolean`

- `true` if IP is within the subnet range
- `false` if IP is outside range, or if either input is invalid

**Notes:**

- Returns `false` for any validation errors (invalid IP, invalid CIDR, version mismatch)
- Uses binary string comparison for precision
- Handles IPv6 compression automatically

## Usage Examples

### Basic IPv4 Subnet Check

```typescript
import { isInSubnet } from '@tundralibs/utils';

// Standard subnet checks
isInSubnet('192.168.1.10', '192.168.0.0/16'); // true (in 192.168.0.0-192.168.255.255)
isInSubnet('192.168.1.10', '192.168.1.0/24'); // true (in 192.168.1.0-192.168.1.255)
isInSubnet('192.168.1.10', '192.168.2.0/24'); // false (different /24 subnet)
isInSubnet('10.0.0.1', '192.168.0.0/16'); // false (different network)

// Edge cases
isInSubnet('192.168.0.0', '192.168.0.0/24'); // true (network address)
isInSubnet('192.168.0.255', '192.168.0.0/24'); // true (broadcast address)
isInSubnet('192.168.1.0', '192.168.0.0/24'); // false (next subnet)
```

### IPv6 Subnet Membership

```typescript
// Standard IPv6 checks
isInSubnet('2001:db8::1', '2001:db8::/32'); // true
isInSubnet('2001:db8:1::1', '2001:db8::/32'); // true (same /32 block)
isInSubnet('2001:db9::1', '2001:db8::/32'); // false (different /32)

// Compressed notation (handled automatically)
isInSubnet('::1', '::1/128'); // true (loopback, exact match)
isInSubnet('fe80::1', 'fe80::/10'); // true (link-local range)
isInSubnet('2001:db8::1', '2001:db8:1::/48'); // false (different /48)

// IPv4-mapped IPv6
isInSubnet('::ffff:192.168.1.1', '::ffff:192.168.0.0/112'); // true
```

### Private Network Detection

```typescript
import { isInSubnet } from '@tundralibs/utils';

const PRIVATE_NETWORKS = [
  '10.0.0.0/8', // Class A private
  '172.16.0.0/12', // Class B private
  '192.168.0.0/16', // Class C private
  '169.254.0.0/16', // Link-local
  '127.0.0.0/8', // Loopback
];

function isPrivateIP(ip: string): boolean {
  return PRIVATE_NETWORKS.some((network) => isInSubnet(ip, network));
}

isPrivateIP('192.168.1.1'); // true
isPrivateIP('172.16.50.1'); // true
isPrivateIP('8.8.8.8'); // false (public)
isPrivateIP('127.0.0.1'); // true (loopback)
```

### Access Control Lists (ACL)

```typescript
interface ACLRule {
  name: string;
  subnet: string;
  action: 'allow' | 'deny';
  priority: number;
}

function checkACL(ip: string, rules: ACLRule[]): 'allow' | 'deny' {
  // Sort by priority (higher first)
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (isInSubnet(ip, rule.subnet)) {
      console.log(`IP ${ip} matched rule: ${rule.name}`);
      return rule.action;
    }
  }

  // Default deny
  return 'deny';
}

const aclRules: ACLRule[] = [
  {
    name: 'Admin Network',
    subnet: '10.0.1.0/24',
    action: 'allow',
    priority: 100,
  },
  {
    name: 'Internal Network',
    subnet: '10.0.0.0/16',
    action: 'allow',
    priority: 50,
  },
  {
    name: 'Blocked Subnet',
    subnet: '10.0.50.0/24',
    action: 'deny',
    priority: 75,
  },
];

checkACL('10.0.1.10', aclRules); // 'allow' (admin network, priority 100)
checkACL('10.0.50.10', aclRules); // 'deny' (blocked subnet, priority 75)
checkACL('10.0.100.1', aclRules); // 'allow' (internal network, priority 50)
checkACL('192.168.1.1', aclRules); // 'deny' (no match, default)
```

### Multi-Tier Network Validation

```typescript
const NETWORK_TIERS = {
  dmz: ['10.0.1.0/24', '10.0.2.0/24'],
  backend: ['10.0.10.0/24', '10.0.11.0/24'],
  database: ['10.0.20.0/24'],
  management: ['10.0.100.0/24'],
};

function getNetworkTier(ip: string): string | null {
  for (const [tier, subnets] of Object.entries(NETWORK_TIERS)) {
    if (subnets.some((subnet) => isInSubnet(ip, subnet))) {
      return tier;
    }
  }
  return null;
}

function canAccess(sourceIP: string, destIP: string): boolean {
  const sourceTier = getNetworkTier(sourceIP);
  const destTier = getNetworkTier(destIP);

  if (!sourceTier || !destTier) return false;

  // Define access matrix
  const accessMatrix: Record<string, string[]> = {
    dmz: ['backend'],
    backend: ['database'],
    management: ['dmz', 'backend', 'database'],
    database: [],
  };

  return accessMatrix[sourceTier]?.includes(destTier) ?? false;
}

canAccess('10.0.1.10', '10.0.10.5'); // true (DMZ → Backend)
canAccess('10.0.10.5', '10.0.20.5'); // true (Backend → Database)
canAccess('10.0.1.10', '10.0.20.5'); // false (DMZ cannot directly access Database)
canAccess('10.0.100.10', '10.0.20.5'); // true (Management can access Database)
```

### Load Balancer Backend Pool Selection

```typescript
interface BackendPool {
  name: string;
  subnet: string;
  servers: string[];
  weight: number;
}

function selectBackendPool(
  clientIP: string,
  pools: BackendPool[],
): BackendPool | null {
  // Find pools matching client subnet
  const matchingPools = pools.filter((pool) =>
    isInSubnet(clientIP, pool.subnet)
  );

  if (matchingPools.length === 0) return null;
  if (matchingPools.length === 1) return matchingPools[0];

  // If multiple matches, use weighted selection
  const totalWeight = matchingPools.reduce((sum, pool) => sum + pool.weight, 0);
  let random = Math.random() * totalWeight;

  for (const pool of matchingPools) {
    random -= pool.weight;
    if (random <= 0) return pool;
  }

  return matchingPools[0]; // Fallback
}

const pools: BackendPool[] = [
  {
    name: 'US-East',
    subnet: '10.0.0.0/16',
    servers: ['10.0.1.10', '10.0.1.11'],
    weight: 60,
  },
  {
    name: 'US-West',
    subnet: '10.1.0.0/16',
    servers: ['10.1.1.10', '10.1.1.11'],
    weight: 40,
  },
  {
    name: 'Management',
    subnet: '10.0.100.0/24',
    servers: ['10.0.100.10'],
    weight: 100,
  },
];

const pool = selectBackendPool('10.0.50.10', pools);
console.log(pool?.name); // 'US-East' or 'Management' based on weight
```

### Geographic Routing

```typescript
interface GeoRegion {
  name: string;
  subnets: string[];
  cdnEndpoint: string;
}

const GEO_REGIONS: GeoRegion[] = [
  {
    name: 'North America',
    subnets: ['10.0.0.0/8', '192.168.0.0/16'],
    cdnEndpoint: 'https://cdn-na.example.com',
  },
  {
    name: 'Europe',
    subnets: ['172.16.0.0/12'],
    cdnEndpoint: 'https://cdn-eu.example.com',
  },
  {
    name: 'Asia Pacific',
    subnets: ['100.64.0.0/10'],
    cdnEndpoint: 'https://cdn-ap.example.com',
  },
];

function getCDNEndpoint(clientIP: string): string {
  for (const region of GEO_REGIONS) {
    if (region.subnets.some((subnet) => isInSubnet(clientIP, subnet))) {
      return region.cdnEndpoint;
    }
  }
  return 'https://cdn-global.example.com'; // Default
}

getCDNEndpoint('192.168.1.1'); // 'https://cdn-na.example.com'
getCDNEndpoint('172.16.50.1'); // 'https://cdn-eu.example.com'
getCDNEndpoint('8.8.8.8'); // 'https://cdn-global.example.com'
```

### VPN Subnet Assignment

```typescript
interface VPNPool {
  name: string;
  subnet: string;
  nextIP: number; // Last octet of next available IP
  capacity: number;
}

function assignVPNAddress(userGroup: string, pools: VPNPool[]): string | null {
  const pool = pools.find((p) => p.name === userGroup);
  if (!pool) return null;

  // Parse subnet
  const [network, maskStr] = pool.subnet.split('/');
  const [a, b, c] = network.split('.').map(Number);

  // Generate next IP
  if (pool.nextIP >= pool.capacity) return null; // Pool exhausted

  const ip = `${a}.${b}.${c}.${pool.nextIP}`;
  pool.nextIP++;

  // Verify it's in the pool's subnet
  if (!isInSubnet(ip, pool.subnet)) {
    console.error('Generated IP outside pool subnet');
    return null;
  }

  return ip;
}

const vpnPools: VPNPool[] = [
  { name: 'employees', subnet: '10.8.0.0/24', nextIP: 10, capacity: 254 },
  { name: 'contractors', subnet: '10.9.0.0/24', nextIP: 10, capacity: 254 },
];

const empIP = assignVPNAddress('employees', vpnPools); // '10.8.0.10'
const contrIP = assignVPNAddress('contractors', vpnPools); // '10.9.0.10'
```

### Network Monitoring and Alerting

```typescript
interface MonitoringZone {
  name: string;
  subnets: string[];
  alertThreshold: number; // Max requests per minute
}

class NetworkMonitor {
  private zones: MonitoringZone[];
  private requestCounts = new Map<string, number>();

  constructor(zones: MonitoringZone[]) {
    this.zones = zones;
  }

  recordRequest(ip: string): void {
    const count = (this.requestCounts.get(ip) || 0) + 1;
    this.requestCounts.set(ip, count);

    const zone = this.getZone(ip);
    if (zone && count > zone.alertThreshold) {
      this.alert(
        `High traffic from ${ip} in zone ${zone.name}: ${count} requests`,
      );
    }
  }

  private getZone(ip: string): MonitoringZone | null {
    return this.zones.find((zone) =>
      zone.subnets.some((subnet) => isInSubnet(ip, subnet))
    ) || null;
  }

  private alert(message: string): void {
    console.error(`[ALERT] ${message}`);
  }
}

const monitor = new NetworkMonitor([
  { name: 'Trusted', subnets: ['10.0.0.0/8'], alertThreshold: 1000 },
  { name: 'Public', subnets: ['0.0.0.0/0'], alertThreshold: 100 },
]);
```

## Error Handling

The function returns `false` for all error conditions (silent failure):

```typescript
// Invalid IP addresses
isInSubnet('invalid', '192.168.0.0/24'); // false
isInSubnet('256.1.1.1', '192.168.0.0/24'); // false

// Invalid CIDR notation
isInSubnet('192.168.1.1', '192.168.0.0'); // false (missing mask)
isInSubnet('192.168.1.1', '192.168.0.0/99'); // false (invalid mask)

// Version mismatch
isInSubnet('192.168.1.1', '2001:db8::/32'); // false (IPv4 vs IPv6)
isInSubnet('2001:db8::1', '192.168.0.0/16'); // false (IPv6 vs IPv4)

// Empty or null inputs (type errors in TypeScript)
// isInSubnet('', '192.168.0.0/24');          // false
```

For explicit validation:

```typescript
import { isSubnet, isValidIPv4, isValidIPv6Structure } from '@tundralibs/utils';

function validateSubnetCheck(ip: string, cidr: string): string | true {
  if (!isSubnet(cidr)) {
    return `Invalid CIDR notation: ${cidr}`;
  }

  const isIPv4CIDR = cidr.includes('.');
  const isIPv4Addr = IPV4_REGEX.test(ip);

  if (isIPv4CIDR && !isValidIPv4(ip)) {
    return `Invalid IPv4 address: ${ip}`;
  }
  if (!isIPv4CIDR && !isValidIPv6Structure(ip)) {
    return `Invalid IPv6 address: ${ip}`;
  }
  if (isIPv4CIDR !== isIPv4Addr) {
    return 'IP version mismatch with CIDR notation';
  }

  return true;
}

const validation = validateSubnetCheck('192.168.1.1', '192.168.0.0/24');
if (validation === true) {
  const inSubnet = isInSubnet('192.168.1.1', '192.168.0.0/24');
  // ... proceed with valid inputs
} else {
  console.error(validation);
}
```

## Performance Considerations

- **Binary Comparison**: O(1) substring comparison after conversion
- **IPv4 Conversion**: ~5-10μs per IP address
- **IPv6 Conversion**: ~20-30μs per IP address (includes expansion)
- **Validation Overhead**: ~2-5μs for input validation
- **Total Time**: Typically 10-50μs per check depending on IP version

For high-throughput scenarios:

```typescript
// Cache subnet binary representation
const subnetCache = new Map<string, { binary: string; mask: number }>();

function isInSubnetCached(ip: string, cidr: string): boolean {
  let subnet = subnetCache.get(cidr);
  if (!subnet) {
    // Parse and cache subnet
    const [network, maskStr] = cidr.split('/');
    const mask = parseInt(maskStr);
    const binary = ipv4ToBinary(network); // or ipv6ToBinary
    subnet = { binary, mask };
    subnetCache.set(cidr, subnet);
  }

  const ipBinary = ipv4ToBinary(ip); // or ipv6ToBinary
  return ipBinary.substring(0, subnet.mask) ===
    subnet.binary.substring(0, subnet.mask);
}
```

## Best Practices

### Do's

✅ **Use for security decisions:**

```typescript
if (isInSubnet(clientIP, trustedNetwork)) {
  // Allow privileged access
}
```

✅ **Combine with validation:**

```typescript
import { isSubnet, isValidIPv4 } from '@tundralibs/utils';

if (isValidIPv4(ip) && isSubnet(cidr) && isInSubnet(ip, cidr)) {
  // All inputs valid
}
```

✅ **Handle both IP versions:**

```typescript
function checkAccess(ip: string): boolean {
  return (
    isInSubnet(ip, '10.0.0.0/8') ||
    isInSubnet(ip, '2001:db8::/32')
  );
}
```

✅ **Use for network segmentation:**

```typescript
const tier = getTier(ip);
const allowedTiers = getAllowedDestinations(tier);
if (allowedTiers.some((subnet) => isInSubnet(destIP, subnet))) {
  // Allow communication
}
```

### Don'ts

❌ **Don't assume validation:**

```typescript
// BAD: No validation, could return false unexpectedly
if (!isInSubnet(userInput, cidr)) {
  // Is it outside subnet, or is the input invalid?
}

// GOOD: Explicit validation
if (!isValidIPv4(userInput)) {
  return 'Invalid IP address';
}
if (!isInSubnet(userInput, cidr)) {
  return 'IP not in allowed subnet';
}
```

❌ **Don't mix IP versions:**

```typescript
// BAD: Will always return false
isInSubnet('192.168.1.1', '2001:db8::/32');

// GOOD: Check version compatibility
const isIPv4 = ip.includes('.');
const isIPv4Subnet = cidr.includes('.');
if (isIPv4 === isIPv4Subnet) {
  isInSubnet(ip, cidr);
}
```

❌ **Don't use string comparison:**

```typescript
// BAD: String comparison doesn't work
if (ip >= '192.168.0.0' && ip <= '192.168.255.255') {}

// GOOD: Use proper subnet check
if (isInSubnet(ip, '192.168.0.0/16')) {}
```

## Related

- [IP Utils](./Utils-IpUtils.md) - Low-level IP utilities used by this module
- [Is Public IP](./Utils-IsPublicIP.md) - Detect public vs private addresses
- [Is Subnet](./Utils-IsSubnet.md) - Validate CIDR notation format
- [Get Free Port](./Utils-GetFreePort.md) - Network port allocation

# Is Subnet - CIDR Notation Validation

## Overview

The `isSubnet` utility validates whether a string represents a valid subnet in CIDR (Classless Inter-Domain Routing) notation. It performs comprehensive validation of:

- **IPv4 CIDR**: Validates format like `192.168.0.0/24` (mask range: /0 to /32)
- **IPv6 CIDR**: Validates format like `2001:db8::/32` (mask range: /0 to /128)
- **Address Format**: Checks IP address structure and segment validity
- **Mask Range**: Ensures subnet mask is within valid bounds

This is essential for:

- Network configuration validation
- Firewall rule verification
- IP address management systems
- Routing table validation

## API

### `isSubnet(ip: string): boolean`

Validates if a string represents a valid subnet in CIDR notation.

**Parameters:**

- `ip` (string): String to validate as CIDR notation

**Returns:** `boolean`

- `true` if the string is valid CIDR notation (IPv4 or IPv6)
- `false` if invalid format, missing mask, or out-of-range mask

**Validation Rules:**

- Must contain exactly one `/` separator
- IP portion must be valid IPv4 or IPv6 address
- Mask must be a numeric string (no leading zeros except for "0")
- IPv4 mask must be 0-32
- IPv6 mask must be 0-128
- All IP segments must be in valid range

## Usage Examples

### Basic IPv4 Subnet Validation

```typescript
import { isSubnet } from '@tundralibs/utils';

// Valid IPv4 subnets
isSubnet('192.168.0.0/24'); // true - /24 subnet (256 addresses)
isSubnet('10.0.0.0/8'); // true - /8 subnet (16.7M addresses)
isSubnet('172.16.0.0/12'); // true - /12 subnet (1M addresses)
isSubnet('0.0.0.0/0'); // true - /0 subnet (all IPv4 addresses)
isSubnet('255.255.255.255/32'); // true - /32 subnet (single address)

// Invalid IPv4 subnets
isSubnet('192.168.1.1'); // false - missing subnet mask
isSubnet('192.168.0.0/33'); // false - mask > 32
isSubnet('192.168.0.0/-1'); // false - negative mask
isSubnet('256.168.0.0/24'); // false - invalid IP (256 > 255)
isSubnet('192.168.0/24'); // false - incomplete IP
isSubnet('192.168.0.0/24/25'); // false - multiple slashes
```

### IPv6 Subnet Validation

```typescript
// Valid IPv6 subnets
isSubnet('2001:db8::/32'); // true - /32 subnet
isSubnet('::/0'); // true - all IPv6 addresses
isSubnet('fe80::/10'); // true - link-local range
isSubnet('fc00::/7'); // true - unique local addresses
isSubnet('::1/128'); // true - loopback (single address)
isSubnet('2001:0db8:0000:0000:0000:0000:0000:0001/128'); // true - full form

// Compressed notation
isSubnet('2001:db8::1/64'); // true
isSubnet('::ffff:192.168.1.1/128'); // true - IPv4-mapped IPv6

// Invalid IPv6 subnets
isSubnet('2001:db8::'); // false - missing mask
isSubnet('2001:db8::/129'); // false - mask > 128
isSubnet('gggg::/32'); // false - invalid hex
isSubnet('2001:db8:::1/64'); // false - too many colons
```

### Input Validation for Network Configuration

```typescript
interface NetworkConfig {
  subnet: string;
  gateway: string;
  dns: string[];
}

function validateNetworkConfig(config: NetworkConfig): string[] {
  const errors: string[] = [];

  if (!isSubnet(config.subnet)) {
    errors.push(`Invalid subnet CIDR notation: ${config.subnet}`);
  }

  if (!isValidIPv4(config.gateway)) {
    errors.push(`Invalid gateway IP: ${config.gateway}`);
  }

  config.dns.forEach((dns, index) => {
    if (!isValidIPv4(dns) && !isValidIPv6Structure(dns)) {
      errors.push(`Invalid DNS server at index ${index}: ${dns}`);
    }
  });

  return errors;
}

const config: NetworkConfig = {
  subnet: '192.168.1.0/24',
  gateway: '192.168.1.1',
  dns: ['8.8.8.8', '8.8.4.4'],
};

const errors = validateNetworkConfig(config);
if (errors.length > 0) {
  console.error('Configuration errors:', errors);
} else {
  console.log('Configuration valid');
}
```

### Firewall Rule Validation

```typescript
interface FirewallRule {
  id: number;
  source: string;
  destination: string;
  action: 'allow' | 'deny';
}

function validateFirewallRule(rule: FirewallRule): boolean {
  // Validate source (can be CIDR or single IP)
  const sourceValid = isSubnet(rule.source) ||
    isValidIPv4(rule.source) ||
    isValidIPv6Structure(rule.source);

  // Validate destination (can be CIDR or single IP)
  const destValid = isSubnet(rule.destination) ||
    isValidIPv4(rule.destination) ||
    isValidIPv6Structure(rule.destination);

  if (!sourceValid) {
    console.error(`Rule ${rule.id}: Invalid source - ${rule.source}`);
  }
  if (!destValid) {
    console.error(`Rule ${rule.id}: Invalid destination - ${rule.destination}`);
  }

  return sourceValid && destValid;
}

const rules: FirewallRule[] = [
  {
    id: 1,
    source: '192.168.0.0/16',
    destination: '10.0.0.0/8',
    action: 'allow',
  },
  { id: 2, source: '0.0.0.0/0', destination: '192.168.1.1', action: 'deny' },
  { id: 3, source: '256.1.1.1', destination: '10.0.0.0/8', action: 'allow' }, // Invalid
];

rules.forEach((rule) => {
  const valid = validateFirewallRule(rule);
  console.log(`Rule ${rule.id}: ${valid ? 'VALID' : 'INVALID'}`);
});
```

### Subnet Mask Range Validator

```typescript
function getSubnetInfo(cidr: string): {
  valid: boolean;
  network?: string;
  mask?: number;
  ipVersion?: 'IPv4' | 'IPv6';
  addressCount?: string;
} {
  if (!isSubnet(cidr)) {
    return { valid: false };
  }

  const [network, maskStr] = cidr.split('/');
  const mask = parseInt(maskStr);
  const isIPv4 = network.includes('.');

  let addressCount: string;
  if (isIPv4) {
    const hostBits = 32 - mask;
    addressCount = Math.pow(2, hostBits).toLocaleString();
  } else {
    const hostBits = 128 - mask;
    addressCount = hostBits <= 32
      ? Math.pow(2, hostBits).toLocaleString()
      : `2^${hostBits}`;
  }

  return {
    valid: true,
    network,
    mask,
    ipVersion: isIPv4 ? 'IPv4' : 'IPv6',
    addressCount,
  };
}

console.log(getSubnetInfo('192.168.1.0/24'));
// { valid: true, network: '192.168.1.0', mask: 24, ipVersion: 'IPv4', addressCount: '256' }

console.log(getSubnetInfo('2001:db8::/32'));
// { valid: true, network: '2001:db8::', mask: 32, ipVersion: 'IPv6', addressCount: '2^96' }

console.log(getSubnetInfo('192.168.1.1'));
// { valid: false }
```

### Network Planning and Subnetting

```typescript
interface SubnetPlan {
  name: string;
  cidr: string;
  purpose: string;
}

function validateSubnetPlan(plan: SubnetPlan[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  plan.forEach((subnet, index) => {
    if (!isSubnet(subnet.cidr)) {
      errors.push(
        `Subnet ${
          index + 1
        } (${subnet.name}): Invalid CIDR notation - ${subnet.cidr}`,
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

const plan: SubnetPlan[] = [
  { name: 'Management', cidr: '10.0.0.0/24', purpose: 'Network devices' },
  { name: 'Servers', cidr: '10.0.1.0/24', purpose: 'Application servers' },
  { name: 'Clients', cidr: '10.0.2.0/23', purpose: 'End user devices' },
  { name: 'DMZ', cidr: '10.0.4.0/24', purpose: 'Public-facing services' },
];

const validation = validateSubnetPlan(plan);
if (validation.valid) {
  console.log('Subnet plan is valid');
} else {
  console.error('Validation errors:', validation.errors);
}
```

### Router Configuration Validator

```typescript
interface RouteEntry {
  destination: string;
  gateway: string;
  metric: number;
}

function validateRoutingTable(routes: RouteEntry[]): boolean {
  let allValid = true;

  routes.forEach((route, index) => {
    // Destination must be valid CIDR
    if (!isSubnet(route.destination)) {
      console.error(
        `Route ${index + 1}: Invalid destination CIDR - ${route.destination}`,
      );
      allValid = false;
    }

    // Gateway must be valid IP
    if (!isValidIPv4(route.gateway) && !isValidIPv6Structure(route.gateway)) {
      console.error(
        `Route ${index + 1}: Invalid gateway IP - ${route.gateway}`,
      );
      allValid = false;
    }

    // Check IP version compatibility
    const destIsIPv4 = route.destination.includes('.');
    const gatewayIsIPv4 = route.gateway.includes('.');
    if (destIsIPv4 !== gatewayIsIPv4) {
      console.error(
        `Route ${index + 1}: IP version mismatch (dest vs gateway)`,
      );
      allValid = false;
    }
  });

  return allValid;
}

const routingTable: RouteEntry[] = [
  { destination: '0.0.0.0/0', gateway: '192.168.1.1', metric: 100 },
  { destination: '10.0.0.0/8', gateway: '192.168.1.254', metric: 10 },
  { destination: '::/0', gateway: 'fe80::1', metric: 100 },
];

validateRoutingTable(routingTable);
```

### API Input Sanitization

```typescript
interface SubnetRequest {
  action: 'create' | 'update' | 'delete';
  cidr: string;
  name: string;
}

function sanitizeSubnetRequest(req: SubnetRequest): {
  valid: boolean;
  sanitized?: SubnetRequest;
  error?: string;
} {
  // Validate CIDR notation
  if (!isSubnet(req.cidr)) {
    return {
      valid: false,
      error: `Invalid CIDR notation: ${req.cidr}`,
    };
  }

  // Sanitize name (remove special characters)
  const sanitizedName = req.name.replace(/[^a-zA-Z0-9_-]/g, '');

  // Normalize CIDR (trim whitespace)
  const sanitizedCIDR = req.cidr.trim();

  return {
    valid: true,
    sanitized: {
      action: req.action,
      cidr: sanitizedCIDR,
      name: sanitizedName,
    },
  };
}

const request: SubnetRequest = {
  action: 'create',
  cidr: ' 192.168.1.0/24 ',
  name: 'test-subnet!@#',
};

const result = sanitizeSubnetRequest(request);
if (result.valid) {
  console.log('Sanitized request:', result.sanitized);
  // { action: 'create', cidr: '192.168.1.0/24', name: 'test-subnet' }
}
```

### Docker Network Configuration

```typescript
interface DockerNetwork {
  name: string;
  subnet: string;
  gateway: string;
  ipRange?: string;
}

function validateDockerNetwork(network: DockerNetwork): boolean {
  console.log(`Validating Docker network: ${network.name}`);

  // Validate subnet
  if (!isSubnet(network.subnet)) {
    console.error(`Invalid subnet: ${network.subnet}`);
    return false;
  }

  // Validate gateway is an IP (should be within subnet ideally)
  if (!isValidIPv4(network.gateway)) {
    console.error(`Invalid gateway: ${network.gateway}`);
    return false;
  }

  // Validate optional IP range
  if (network.ipRange && !isSubnet(network.ipRange)) {
    console.error(`Invalid IP range: ${network.ipRange}`);
    return false;
  }

  console.log('Docker network configuration is valid');
  return true;
}

const dockerNet: DockerNetwork = {
  name: 'app-network',
  subnet: '172.20.0.0/16',
  gateway: '172.20.0.1',
  ipRange: '172.20.1.0/24',
};

validateDockerNetwork(dockerNet);
```

### Cloud VPC CIDR Validation

```typescript
interface VPCConfig {
  vpcCIDR: string;
  subnets: {
    name: string;
    cidr: string;
    availabilityZone: string;
  }[];
}

function validateVPCConfig(vpc: VPCConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate VPC CIDR
  if (!isSubnet(vpc.vpcCIDR)) {
    errors.push(`Invalid VPC CIDR: ${vpc.vpcCIDR}`);
  }

  // Validate subnet CIDRs
  vpc.subnets.forEach((subnet, index) => {
    if (!isSubnet(subnet.cidr)) {
      errors.push(
        `Subnet ${index + 1} (${subnet.name}): Invalid CIDR - ${subnet.cidr}`,
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

const vpcConfig: VPCConfig = {
  vpcCIDR: '10.0.0.0/16',
  subnets: [
    { name: 'public-1a', cidr: '10.0.1.0/24', availabilityZone: 'us-east-1a' },
    { name: 'private-1a', cidr: '10.0.2.0/24', availabilityZone: 'us-east-1a' },
    { name: 'public-1b', cidr: '10.0.3.0/24', availabilityZone: 'us-east-1b' },
  ],
};

const vpcValidation = validateVPCConfig(vpcConfig);
console.log(vpcValidation);
```

## Error Handling

Returns `false` for all invalid inputs:

```typescript
// Missing subnet mask
isSubnet('192.168.1.0'); // false

// Out of range mask
isSubnet('192.168.0.0/33'); // false (IPv4 max is /32)
isSubnet('2001:db8::/129'); // false (IPv6 max is /128)
isSubnet('192.168.0.0/-1'); // false (negative mask)

// Invalid IP address
isSubnet('256.1.1.1/24'); // false (256 > 255)
isSubnet('192.168.1/24'); // false (incomplete)
isSubnet('gggg::/32'); // false (invalid hex)

// Invalid format
isSubnet('192.168.0.0/24/25'); // false (multiple slashes)
isSubnet('192.168.0.0/'); // false (missing mask value)
isSubnet('/24'); // false (missing IP)

// Leading zeros in mask (except "0")
isSubnet('192.168.0.0/08'); // false (leading zero in "08")
isSubnet('192.168.0.0/0'); // true (single "0" is valid)
```

For detailed error reporting:

```typescript
function validateSubnetWithDetails(cidr: string): {
  valid: boolean;
  error?: string;
} {
  if (!cidr.includes('/')) {
    return { valid: false, error: 'Missing subnet mask (/)' };
  }

  const parts = cidr.split('/');
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid format: multiple slashes' };
  }

  const [ip, maskStr] = parts;
  const mask = parseInt(maskStr);

  // Check for leading zeros (except "0")
  if (maskStr !== '0' && maskStr.startsWith('0')) {
    return { valid: false, error: 'Subnet mask has leading zero' };
  }

  const isIPv4 = ip.includes('.');
  if (isIPv4) {
    if (!isValidIPv4(ip)) {
      return { valid: false, error: `Invalid IPv4 address: ${ip}` };
    }
    if (mask < 0 || mask > 32) {
      return { valid: false, error: `IPv4 mask must be 0-32, got: ${mask}` };
    }
  } else {
    if (!isValidIPv6Structure(ip)) {
      return { valid: false, error: `Invalid IPv6 address: ${ip}` };
    }
    if (mask < 0 || mask > 128) {
      return { valid: false, error: `IPv6 mask must be 0-128, got: ${mask}` };
    }
  }

  return { valid: true };
}

console.log(validateSubnetWithDetails('192.168.0.0/33'));
// { valid: false, error: 'IPv4 mask must be 0-32, got: 33' }
```

## Performance Considerations

- **IPv4 Validation**: ~10-15μs (regex + octet validation)
- **IPv6 Validation**: ~25-35μs (expansion + segment validation)
- **Mask Parsing**: ~1-2μs
- **Total Time**: Typically 15-40μs per call

For bulk validation:

```typescript
function validateSubnetBatch(cidrs: string[]): Map<string, boolean> {
  const results = new Map<string, boolean>();

  for (const cidr of cidrs) {
    results.set(cidr, isSubnet(cidr));
  }

  return results;
}

const cidrs = [
  '192.168.0.0/24',
  '10.0.0.0/8',
  '256.1.1.1/24',
  '2001:db8::/32',
];

const results = validateSubnetBatch(cidrs);
results.forEach((valid, cidr) => {
  console.log(`${cidr}: ${valid ? 'VALID' : 'INVALID'}`);
});
```

## Best Practices

### Do's

✅ **Validate before use:**

```typescript
if (isSubnet(userInput)) {
  // Safe to parse and use
  const [network, mask] = userInput.split('/');
}
```

✅ **Use with subnet operations:**

```typescript
import { isInSubnet, isSubnet } from '@tundralibs/utils';

if (isSubnet(cidr)) {
  const inRange = isInSubnet(ip, cidr);
}
```

✅ **Provide clear feedback:**

```typescript
if (!isSubnet(config.subnet)) {
  throw new Error(
    `Invalid subnet CIDR notation: ${config.subnet}. Expected format: IPv4/mask or IPv6/mask`,
  );
}
```

✅ **Handle both IP versions:**

```typescript
function processSubnet(cidr: string) {
  if (!isSubnet(cidr)) {
    return null;
  }

  const isIPv4 = cidr.includes('.');
  // ... version-specific logic
}
```

### Don'ts

❌ **Don't skip validation:**

```typescript
// BAD: Assumes input is valid
const [network, mask] = userInput.split('/');
const maskNum = parseInt(mask); // Could be NaN or out of range

// GOOD: Validate first
if (isSubnet(userInput)) {
  const [network, mask] = userInput.split('/');
  const maskNum = parseInt(mask);
}
```

❌ **Don't validate IP and CIDR separately when subnet expected:**

```typescript
// BAD: Allows IP without mask
if (isValidIPv4(input)) {
  // But subnet operations need mask!
}

// GOOD: Use isSubnet
if (isSubnet(input)) {
  // Guaranteed to have IP and mask
}
```

❌ **Don't assume mask is reasonable:**

```typescript
// Even if valid, /32 and /0 are edge cases
if (isSubnet(cidr)) {
  const mask = parseInt(cidr.split('/')[1]);
  if (mask < 8 || mask > 30) {
    console.warn('Unusual subnet mask:', mask);
  }
}
```

## Common Use Cases

| Use Case             | Description                    | Typical Masks              |
| -------------------- | ------------------------------ | -------------------------- |
| Network Planning     | Validate subnet allocations    | IPv4: /8, /16, /24         |
| Firewall Rules       | Validate CIDR in ACLs          | IPv4: /24-/32              |
| Router Configuration | Validate routing table entries | IPv4: /0 (default), /8-/24 |
| VPC/VNet Setup       | Cloud network CIDR validation  | IPv4: /16-/24              |
| Docker Networks      | Container network config       | IPv4: /16, /24             |
| IPv6 Allocation      | ISP or enterprise IPv6 ranges  | IPv6: /32, /48, /64        |

## Related

- [Is In Subnet](./Utils-IsInSubnet.md) - Check if IP is within a subnet (uses this for validation)
- [IP Utils](./Utils-IpUtils.md) - Low-level IP utilities for address manipulation
- [Is Public IP](./Utils-IsPublicIP.md) - Detect public vs private addresses
- [Get Free Port](./Utils-GetFreePort.md) - Network port allocation

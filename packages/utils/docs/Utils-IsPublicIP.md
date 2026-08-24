# Is Public IP - Public IP Address Detection

## Overview

The `isPublicIP` utility determines whether an IP address is publicly routable or belongs to private, local, or reserved address ranges. It supports:

- **IPv4**: 14 reserved ranges — RFC 1918 private networks, RFC 1122
  loopback/current-network, RFC 3927 link-local, RFC 6598
  carrier-grade NAT, RFC 6890 IETF protocol assignments, RFC 5737
  documentation (TEST-NET-1/2/3), RFC 2544 benchmarking, RFC 5771
  multicast, and RFC 1112 reserved/broadcast — see the full table
  below
- **IPv6**: Unique Local (`fc00::/7`), Link-local (`fe80::/10`),
  Multicast (`ff00::/8`), Loopback (`::1`), Unspecified (`::`)
- **IPv4-mapped IPv6** (`::ffff:a.b.c.d`): unwrapped and judged by the
  embedded IPv4 address's own range, not treated as a bare IPv6 address

This is essential for:

- Security policies and firewall rules
- Content delivery and geographic routing
- Network diagnostics and troubleshooting
- Privacy and data compliance

## API

### `isPublicIP(ip: string): boolean`

Determines if an IP address is publicly routable.

**Parameters:**

- `ip` (string): IPv4 or IPv6 address to check

**Returns:** `boolean`

- `true` if the IP is publicly routable (not private/local/reserved)
- `false` if the IP is private, local, reserved, or invalid

**Reserved IPv4 Ranges Checked** (all 14 — this list is exhaustive,
not illustrative):

| Range             | Meaning                                              |
| ----------------- | ---------------------------------------------------- |
| `0.0.0.0/8`       | Current network (RFC 1122)                           |
| `10.0.0.0/8`      | Private network (RFC 1918)                           |
| `100.64.0.0/10`   | Carrier-grade NAT / shared space (RFC 6598)          |
| `127.0.0.0/8`     | Loopback (RFC 1122)                                  |
| `169.254.0.0/16`  | Link-local / APIPA (RFC 3927)                        |
| `172.16.0.0/12`   | Private network (RFC 1918)                           |
| `192.0.0.0/24`    | IETF protocol assignments (RFC 6890)                 |
| `192.0.2.0/24`    | TEST-NET-1 documentation (RFC 5737)                  |
| `192.168.0.0/16`  | Private network (RFC 1918)                           |
| `198.18.0.0/15`   | Benchmarking (RFC 2544)                              |
| `198.51.100.0/24` | TEST-NET-2 documentation (RFC 5737)                  |
| `203.0.113.0/24`  | TEST-NET-3 documentation (RFC 5737)                  |
| `224.0.0.0/4`     | Multicast (RFC 5771)                                 |
| `240.0.0.0/4`     | Reserved, incl. broadcast 255.255.255.255 (RFC 1112) |

**Reserved IPv6 Ranges Checked:**

- `fc00::/7` - Unique Local Addresses (RFC 4193)
- `fe80::/10` - Link-local addresses (RFC 4291)
- `ff00::/8` - Multicast (RFC 4291)
- `::1` - Loopback address (exact match, not a range)
- `::` - Unspecified address (exact match, not a range)
- `::ffff:a.b.c.d` (IPv4-mapped) - judged by the embedded IPv4
  address's own reserved-range membership, not by any IPv6 range

## Usage Examples

### Basic Public/Private Detection

```typescript
import { isPublicIP } from '@tundralibs/utils';

// Public IPv4 addresses
isPublicIP('8.8.8.8'); // true - Google DNS
isPublicIP('1.1.1.1'); // true - Cloudflare DNS
isPublicIP('208.67.222.222'); // true - OpenDNS

// Private IPv4 addresses
isPublicIP('192.168.1.1'); // false - RFC 1918 private
isPublicIP('10.0.0.1'); // false - RFC 1918 private
isPublicIP('172.16.50.1'); // false - RFC 1918 private
isPublicIP('127.0.0.1'); // false - Loopback
isPublicIP('169.254.1.1'); // false - Link-local

// Easy-to-miss reserved IPv4 ranges (not just the RFC 1918 three)
isPublicIP('100.64.0.1'); // false - Carrier-grade NAT (RFC 6598)
isPublicIP('203.0.113.5'); // false - TEST-NET-3 documentation range
isPublicIP('224.0.0.1'); // false - Multicast

// Public IPv6 addresses
isPublicIP('2001:4860:4860::8888'); // true - Google IPv6 DNS
isPublicIP('2606:4700:4700::1111'); // true - Cloudflare IPv6 DNS

// Private IPv6 addresses
isPublicIP('fe80::1'); // false - Link-local
isPublicIP('fc00::1'); // false - Unique local
isPublicIP('ff02::1'); // false - Multicast
isPublicIP('::1'); // false - Loopback
isPublicIP('::'); // false - Unspecified

// IPv4-mapped IPv6 — judged by the embedded IPv4 address, not as IPv6
isPublicIP('::ffff:192.168.1.1'); // false - embedded IPv4 is RFC 1918 private
isPublicIP('::ffff:8.8.8.8'); // true - embedded IPv4 is public
```

### Security Validation

```typescript
import { isPublicIP } from '@tundralibs/utils';

function validateExternalAccess(remoteIP: string): boolean {
  if (!isPublicIP(remoteIP)) {
    console.error(`Blocked access from private IP: ${remoteIP}`);
    return false;
  }

  console.log(`Allowed access from public IP: ${remoteIP}`);
  return true;
}

// API endpoint protection
function handleAPIRequest(req: Request): Response {
  const clientIP = req.headers.get('x-forwarded-for') || 'unknown';

  if (!validateExternalAccess(clientIP)) {
    return new Response('Access denied: private network', { status: 403 });
  }

  // Process public request
  return new Response('OK');
}
```

### Network Type Classification

```typescript
import {
  isPublicIP,
  isValidIPv4,
  isValidIPv6Structure,
} from '@tundralibs/utils';

function getNetworkType(
  ip: string,
): 'public' | 'private' | 'loopback' | 'link-local' | 'invalid' {
  if (!isValidIPv4(ip) && !isValidIPv6Structure(ip)) {
    return 'invalid';
  }

  if (ip.startsWith('127.') || ip === '::1') {
    return 'loopback';
  }

  if (ip.startsWith('169.254.') || ip.startsWith('fe80:')) {
    return 'link-local';
  }

  if (isPublicIP(ip)) {
    return 'public';
  }

  return 'private';
}

getNetworkType('8.8.8.8'); // 'public'
getNetworkType('192.168.1.1'); // 'private'
getNetworkType('127.0.0.1'); // 'loopback'
getNetworkType('169.254.1.1'); // 'link-local'
```

### Content Delivery Network (CDN) Routing

```typescript
import { isPublicIP } from '@tundralibs/utils';

interface CDNConfig {
  publicEndpoint: string;
  internalEndpoint: string;
}

function getCDNEndpoint(clientIP: string, config: CDNConfig): string {
  if (isPublicIP(clientIP)) {
    // External clients use public CDN
    return config.publicEndpoint;
  } else {
    // Internal clients use internal cache
    return config.internalEndpoint;
  }
}

const cdnConfig: CDNConfig = {
  publicEndpoint: 'https://cdn.example.com',
  internalEndpoint: 'http://cache.internal.local',
};

const endpoint1 = getCDNEndpoint('8.8.8.8', cdnConfig);
// 'https://cdn.example.com'

const endpoint2 = getCDNEndpoint('192.168.1.10', cdnConfig);
// 'http://cache.internal.local'
```

### Rate Limiting by Network Type

```typescript
import { isPublicIP } from '@tundralibs/utils';

class RateLimiter {
  private limits = {
    public: { requests: 100, window: 60000 }, // 100 req/min
    private: { requests: 1000, window: 60000 }, // 1000 req/min
  };

  private counts = new Map<string, { count: number; resetAt: number }>();

  isAllowed(ip: string): boolean {
    const limit = isPublicIP(ip) ? this.limits.public : this.limits.private;
    const now = Date.now();

    let record = this.counts.get(ip);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + limit.window };
      this.counts.set(ip, record);
    }

    record.count++;
    return record.count <= limit.requests;
  }
}

const limiter = new RateLimiter();

limiter.isAllowed('8.8.8.8'); // Public: 100 req/min limit
limiter.isAllowed('192.168.1.1'); // Private: 1000 req/min limit
```

### Firewall Rule Generator

```typescript
import { isPublicIP } from '@tundralibs/utils';

interface FirewallRule {
  source: string;
  action: 'allow' | 'deny';
  reason: string;
}

function generateFirewallRule(ip: string, service: string): FirewallRule {
  if (isPublicIP(ip)) {
    // Public IPs need stricter rules
    return {
      source: ip,
      action: 'allow',
      reason: `Public access to ${service} - requires authentication`,
    };
  } else {
    // Private IPs can have more relaxed rules
    return {
      source: ip,
      action: 'allow',
      reason: `Internal network access to ${service}`,
    };
  }
}

const rule1 = generateFirewallRule('8.8.8.8', 'api');
// { source: '8.8.8.8', action: 'allow', reason: 'Public access to api - requires authentication' }

const rule2 = generateFirewallRule('192.168.1.1', 'admin');
// { source: '192.168.1.1', action: 'allow', reason: 'Internal network access to admin' }
```

### Logging and Analytics

```typescript
import { isPublicIP } from '@tundralibs/utils';

interface RequestLog {
  ip: string;
  timestamp: number;
  networkType: 'public' | 'private';
  endpoint: string;
}

class RequestLogger {
  private logs: RequestLog[] = [];

  log(ip: string, endpoint: string): void {
    this.logs.push({
      ip,
      timestamp: Date.now(),
      networkType: isPublicIP(ip) ? 'public' : 'private',
      endpoint,
    });
  }

  getStats() {
    const publicCount =
      this.logs.filter((l) => l.networkType === 'public').length;
    const privateCount =
      this.logs.filter((l) => l.networkType === 'private').length;

    return {
      total: this.logs.length,
      public: publicCount,
      private: privateCount,
      publicPercentage: (publicCount / this.logs.length) * 100,
    };
  }
}

const logger = new RequestLogger();
logger.log('8.8.8.8', '/api/users');
logger.log('192.168.1.1', '/admin/settings');
logger.log('1.1.1.1', '/api/products');

console.log(logger.getStats());
// { total: 3, public: 2, private: 1, publicPercentage: 66.67 }
```

### Geographic Routing (Dual Stack)

```typescript
import { isPublicIP } from '@tundralibs/utils';

interface RoutingConfig {
  publicIPv4Gateway: string;
  publicIPv6Gateway: string;
  privateGateway: string;
}

function selectGateway(clientIP: string, config: RoutingConfig): string {
  if (!isPublicIP(clientIP)) {
    return config.privateGateway;
  }

  // Public IP: route based on IP version
  if (clientIP.includes(':')) {
    return config.publicIPv6Gateway;
  } else {
    return config.publicIPv4Gateway;
  }
}

const routing: RoutingConfig = {
  publicIPv4Gateway: '203.0.113.1',
  publicIPv6Gateway: '2001:db8::1',
  privateGateway: '10.0.0.1',
};

selectGateway('8.8.8.8', routing); // '203.0.113.1'
selectGateway('2001:4860::8888', routing); // '2001:db8::1'
selectGateway('192.168.1.1', routing); // '10.0.0.1'
```

### Audit and Compliance

```typescript
import { isPublicIP } from '@tundralibs/utils';

interface AccessAudit {
  ip: string;
  networkType: 'public' | 'private';
  resource: string;
  timestamp: Date;
  compliant: boolean;
  reason?: string;
}

function auditAccess(
  ip: string,
  resource: string,
  requiresPublic: boolean,
): AccessAudit {
  const networkType = isPublicIP(ip) ? 'public' : 'private';
  const compliant = requiresPublic ? networkType === 'public' : true;

  return {
    ip,
    networkType,
    resource,
    timestamp: new Date(),
    compliant,
    reason: compliant
      ? undefined
      : 'Private network access to public-only resource',
  };
}

// Audit access to sensitive resources
auditAccess('8.8.8.8', '/public-api', true);
// { ip: '8.8.8.8', networkType: 'public', compliant: true, ... }

auditAccess('192.168.1.1', '/public-api', true);
// { ip: '192.168.1.1', networkType: 'private', compliant: false, reason: '...' }
```

## Implementation Notes

### IPv4 Detection Algorithm

Uses `isIPv4InRange` for precise binary comparison against all 14
reserved ranges:

```typescript ignore
const isReserved = ipv4Ranges.some(([network, cidr]) =>
  isIPv4InRange(ip, network, cidr)
);
return !isReserved; // Public iff none matched
```

### IPv6 Detection Algorithm

Expands to the canonical 8-group form, rejects the two exact special
addresses, unwraps an IPv4-mapped address to its embedded IPv4
address, then compares the 128-bit binary encoding against each
reserved range's binary prefix (**not** string/hex prefix matching):

```typescript ignore
const expanded = expandIPv6(ip); // canonical 8-group form

if (expanded === '0:0:0:0:0:0:0:1') return false; // ::1 loopback
if (expanded === '0:0:0:0:0:0:0:0') return false; // :: unspecified

const binary = ipv6ToBinary(expanded); // 128-char '0'/'1' string

// IPv4-mapped (::ffff:a.b.c.d): 80 zero bits + 16 one bits + embedded IPv4.
// If present, the embedded IPv4's own reserved-range membership decides —
// nothing IPv6-specific applies to it.
const mappedIPv4 = extractIPv4Mapped(binary);
if (mappedIPv4 !== null) return !isReservedIPv4(mappedIPv4);

// fc00::/7, fe80::/10, ff00::/8 as precomputed binary prefixes.
return !ipv6BinaryRanges.some((prefix) => binary.startsWith(prefix));
```

> An earlier revision of this doc described the IPv6 path as string
> prefix matching on the hex form (e.g. `startsWith('fe8')`). That was
> never accurate for the shipped implementation, which expands to
> binary first — a hex-prefix check would also miss a range boundary
> that doesn't land on a hex nibble (`fe80::/10` splits mid-nibble).

## Performance

Benched on Apple M2 Max / Deno 2.9.5, mixed IPv4/IPv6 input
(`packages/utils/isPublicIP.bench.ts`): **~3.5 µs** average per call.

- **Total Time**: Typically 15-40μs per call

For high-performance scenarios:

```typescript
import { isPublicIP } from '@tundralibs/utils';

// Cache results for frequently checked IPs
const publicIPCache = new Map<string, boolean>();

function isPublicIPCached(ip: string): boolean {
  if (publicIPCache.has(ip)) {
    return publicIPCache.get(ip)!;
  }

  const result = isPublicIP(ip);
  publicIPCache.set(ip, result);

  // Limit cache size
  if (publicIPCache.size > 10000) {
    const firstKey = publicIPCache.keys().next().value;
    if (firstKey !== undefined) {
      publicIPCache.delete(firstKey);
    }
  }

  return result;
}
```

## Best Practices

### Do's

✅ **Use for security decisions:**

```typescript
import { isPublicIP } from '@tundralibs/utils';

declare const clientIP: string;
declare function enforceRateLimiting(ip: string): void;
declare function requireAuthentication(): void;

if (isPublicIP(clientIP)) {
  // Apply public-facing security rules
  enforceRateLimiting(clientIP);
  requireAuthentication();
}
```

✅ **Combine with validation:**

```typescript
import {
  isPublicIP,
  isValidIPv4,
  isValidIPv6Structure,
} from '@tundralibs/utils';

declare const ip: string;

if ((isValidIPv4(ip) || isValidIPv6Structure(ip)) && isPublicIP(ip)) {
  // Valid and public
}
```

✅ **Handle both IPv4 and IPv6:**

```typescript
import { isPublicIP } from '@tundralibs/utils';

function routeTraffic(ip: string) {
  const isPublic = isPublicIP(ip);
  const isIPv6 = ip.includes(':');

  // Route based on both factors
  if (isPublic && isIPv6) {
    return 'public-ipv6-gateway';
  } else if (isPublic) {
    return 'public-ipv4-gateway';
  } else {
    return 'internal-gateway';
  }
}
```

✅ **Use for content delivery optimization:**

```typescript
import { isPublicIP } from '@tundralibs/utils';

declare const clientIP: string;

const cacheTTL = isPublicIP(clientIP) ? 3600 : 60; // Longer cache for public
```

### Don'ts

❌ **Don't assume validity:**

```typescript
import { isPublicIP, isValidIPv4 } from '@tundralibs/utils';

declare const userInput: string;

// BAD: Invalid IPs return false (could be misinterpreted)
if (isPublicIP(userInput)) {
  // Could be invalid, not just private
}

// GOOD: Validate first
if (isValidIPv4(userInput) && isPublicIP(userInput)) {
  // Definitely valid and public
}
```

❌ **Don't use for geolocation:**

```typescript
import { isPublicIP } from '@tundralibs/utils';

declare function geolocate(ip: string): Promise<string>;

async function locate(ip: string): Promise<string> {
  // BAD: isPublicIP doesn't determine location
  if (isPublicIP(ip)) {
    return 'US'; // Wrong!
  }

  // GOOD: Use a geolocation service
  return await geolocate(ip);
}
```

❌ **Don't hardcode assumptions:**

```typescript
import { isInSubnet, isPublicIP } from '@tundralibs/utils';

declare const ip: string;
declare function skipAuthentication(): void;

// BAD: Assuming private = trusted
if (!isPublicIP(ip)) {
  skipAuthentication(); // Dangerous!
}

// GOOD: Explicit trust list
const trustedNetworks = ['10.0.1.0/24'];
if (trustedNetworks.some((net) => isInSubnet(ip, net))) {
  // Only trust specific private subnets
}
```

❌ **Don't forget IPv6:**

```typescript
import { isPublicIP } from '@tundralibs/utils';

declare const ip: string;

// BAD: Only checking IPv4 private ranges manually
if (ip.startsWith('192.168.')) {}

// GOOD: Use isPublicIP which handles both
if (!isPublicIP(ip)) {}
```

## Common Use Cases

| Use Case          | Description                            | Example                       |
| ----------------- | -------------------------------------- | ----------------------------- |
| Firewall Rules    | Different rules for public vs internal | Rate limiting, access control |
| CDN Routing       | Route internal traffic to local cache  | Reduce bandwidth costs        |
| Security Policies | Apply stricter rules to public IPs     | Authentication requirements   |
| Analytics         | Separate internal vs external metrics  | User behavior tracking        |
| Rate Limiting     | Different limits for network types     | API throttling                |
| Compliance        | Audit public data access               | GDPR, data privacy            |

## Related

- [IP Utils](./Utils-IpUtils.md) - Low-level IP utilities used by this module
- [Is In Subnet](./Utils-IsInSubnet.md) - Check subnet membership
- [Is Subnet](./Utils-IsSubnet.md) - Validate CIDR notation
- [Get Free Port](./Utils-GetFreePort.md) - Network port allocation

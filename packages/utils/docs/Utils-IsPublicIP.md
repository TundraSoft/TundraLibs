# Is Public IP - Public IP Address Detection

## Overview

The `isPublicIP` utility determines whether an IP address is publicly routable or belongs to private, local, or reserved address ranges. It supports:

- **IPv4 Private Ranges**: RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- **IPv4 Special Ranges**: Link-local (169.254.0.0/16), Loopback (127.0.0.0/8), Unspecified (0.0.0.0/8)
- **IPv6 Private Ranges**: Unique Local (fc00::/7), Link-local (fe80::/10)
- **IPv6 Special Addresses**: Loopback (::1), Unspecified (::)

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

**Private IPv4 Ranges Checked:**

- `10.0.0.0/8` - Class A private network (RFC 1918)
- `172.16.0.0/12` - Class B private network (RFC 1918)
- `192.168.0.0/16` - Class C private network (RFC 1918)
- `169.254.0.0/16` - Link-local addresses (APIPA/RFC 3927)
- `127.0.0.0/8` - Loopback addresses (RFC 1122)
- `0.0.0.0/8` - Unspecified/current network (RFC 1122)

**Private IPv6 Ranges Checked:**

- `fc00::/7` - Unique Local Addresses (RFC 4193)
- `fe80::/10` - Link-local addresses (RFC 4291)
- `::1/128` - Loopback address
- `::/128` - Unspecified address

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

// Public IPv6 addresses
isPublicIP('2001:4860:4860::8888'); // true - Google IPv6 DNS
isPublicIP('2606:4700:4700::1111'); // true - Cloudflare IPv6 DNS

// Private IPv6 addresses
isPublicIP('fe80::1'); // false - Link-local
isPublicIP('fc00::1'); // false - Unique local
isPublicIP('::1'); // false - Loopback
isPublicIP('::'); // false - Unspecified
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

Uses `isIPv4InRange` for precise binary comparison:

```typescript
for (const [network, mask] of ipv4Ranges) {
  if (isIPv4InRange(ip, network, mask)) {
    return false; // Private range
  }
}
return true; // Public
```

### IPv6 Detection Algorithm

Uses string prefix matching for efficiency (optimized for common cases):

```typescript
// Link-local: fe80::/10
if (expandedIPv6.startsWith('fe8') || expandedIPv6.startsWith('fe9') || ...) {
  return false;
}

// Unique local: fc00::/7
if (expandedIPv6.startsWith('fc') || expandedIPv6.startsWith('fd')) {
  return false;
}

// ... other checks
return true; // Public
```

**Note**: IPv6 uses string prefix checking after expansion for performance. While less precise than binary comparison, it covers all standard private/local ranges accurately.

## Performance Considerations

- **IPv4 Check**: ~10-15μs (binary range comparison)
- **IPv6 Check**: ~25-35μs (expansion + string prefix matching)
- **Validation Overhead**: ~2-5μs
- **Total Time**: Typically 15-40μs per call

For high-performance scenarios:

```typescript
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
    publicIPCache.delete(firstKey);
  }

  return result;
}
```

## Best Practices

### Do's

✅ **Use for security decisions:**

```typescript
if (isPublicIP(clientIP)) {
  // Apply public-facing security rules
  enforceRateLimiting(clientIP);
  requireAuthentication();
}
```

✅ **Combine with validation:**

```typescript
import { isValidIPv4, isValidIPv6Structure } from '@tundralibs/utils';

if ((isValidIPv4(ip) || isValidIPv6Structure(ip)) && isPublicIP(ip)) {
  // Valid and public
}
```

✅ **Handle both IPv4 and IPv6:**

```typescript
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
const cacheTTL = isPublicIP(clientIP) ? 3600 : 60; // Longer cache for public
```

### Don'ts

❌ **Don't assume validity:**

```typescript
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
// BAD: isPublicIP doesn't determine location
if (isPublicIP(ip)) {
  return 'US'; // Wrong!
}

// GOOD: Use a geolocation service
const location = await geolocate(ip);
```

❌ **Don't hardcode assumptions:**

```typescript
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

# Get Free Port - Network Port Allocation

## Overview

The `getFreePort` utility provides a robust way to find available TCP ports for network services. It's particularly useful for:

- **Development Servers**: Automatically allocate ports for local development
- **Testing**: Find available ports for test fixtures without conflicts
- **Dynamic Services**: Allocate ports for microservices and containerized applications
- **CI/CD Pipelines**: Prevent port conflicts when running parallel tests

## API

### `getFreePort(options?: GetFreePortOptions): number`

Finds and returns an available TCP port within the specified range.

**Parameters:**

- `options` (optional): Configuration object
  - `min` (number): Minimum port number (default: 1024)
  - `max` (number): Maximum port number (default: 65535)
  - `exclude` (number[]): Array of ports to exclude from selection

**Returns:** `Promise<number>` - Resolves to an available port number

**Throws:** `PortError` if:

- Invalid port range specified (min/max out of bounds or max < min)
- No free port found within constraints after exhausting attempts

### `PortError`

Custom error class for port allocation failures.

```typescript ignore
class PortError extends Error {
  constructor(message: string);
}
```

## Usage Examples

### Basic Usage

```typescript
import { getFreePort } from '@tundralibs/utils';

// Get any available port in safe range
const port = await getFreePort();
console.log(`Server starting on port ${port}`);
```

### Custom Port Range

```typescript
import { getFreePort } from '@tundralibs/utils';

// Find port for development server
const devPort = await getFreePort({ min: 3000, max: 4000 });

// Find port for production-like testing
const prodPort = await getFreePort({ min: 8000, max: 9000 });
```

### Excluding Reserved Ports

```typescript
import { getFreePort } from '@tundralibs/utils';

// Avoid commonly used ports
const port = await getFreePort({
  min: 3000,
  max: 5000,
  exclude: [
    3000, // Common dev server
    3306, // MySQL
    4200, // Angular dev
    5432, // PostgreSQL
  ],
});
```

### Multiple Service Allocation

```typescript
import { getFreePort } from '@tundralibs/utils';

// Allocate ports for a microservices cluster
const services = ['api', 'auth', 'data', 'cache'];
const ports = await Promise.all(services.map(async (service) => {
  const port = await getFreePort({ min: 8000, max: 9000 });
  console.log(`${service} service: port ${port}`);
  return port;
}));
```

### Test Fixtures

```typescript
// Needs a separate install: deno add @tundralibs/compat
import { describe, it } from '@tundralibs/compat/test';
import { getFreePort } from '@tundralibs/utils';

describe('HTTP Server Tests', () => {
  it('should start server on free port', async () => {
    const port = await getFreePort({ min: 9000, max: 10000 });

    // Start your test server on the allocated port
    const server = Deno.serve({ port }, () => new Response('OK'));

    try {
      const response = await fetch(`http://localhost:${port}`);
      // ... assertions
    } finally {
      await server.shutdown();
    }
  });
});
```

### Error Handling

```typescript
import { getFreePort, PortError } from '@tundralibs/utils';

try {
  // This might fail if range is too restrictive
  const port = await getFreePort({
    min: 80,
    max: 100,
    exclude: Array.from({ length: 20 }, (_, i) => 80 + i),
  });
  console.log(`Allocated port: ${port}`);
} catch (error) {
  if (error instanceof PortError) {
    console.error('Failed to allocate port:', error.message);
    // Fallback strategy
    const fallbackPort = await getFreePort(); // Use default range
    console.log(`Using fallback port: ${fallbackPort}`);
  }
}
```

### Integration with Server Frameworks

```typescript
// With Deno's built-in server
import { getFreePort } from '@tundralibs/utils';

const port = await getFreePort({ min: 8000, max: 8100 });
const server = Deno.serve({ port }, (req) => {
  return new Response('Hello World');
});

console.log(`Server running at http://localhost:${port}`);
```

## Algorithm Details

The port allocation uses the following strategy:

1. **Random Selection**: Ports are selected randomly within the range to reduce collision probability
2. **Availability Check**: Each candidate port is tested by attempting to bind a TCP listener
3. **Immediate Release**: Successfully bound ports are immediately released for use
4. **Bounded Attempts**: Maximum attempts = (max - min + 1 - excludeCount) * 3 to prevent infinite loops
5. **Exclusion Filtering**: Excluded ports are skipped during selection

This approach balances randomization (good for parallel processes) with deterministic termination.

## Best Practices

### Do's

✅ **Use appropriate ranges:**

```typescript
import { getFreePort } from '@tundralibs/utils';

// Development: 3000-5000
const devPort = await getFreePort({ min: 3000, max: 5000 });

// Testing: 9000-10000
const testPort = await getFreePort({ min: 9000, max: 10000 });

// Production-like: 8000-9000
const prodPort = await getFreePort({ min: 8000, max: 9000 });
```

✅ **Exclude known service ports:**

```typescript
import { getFreePort } from '@tundralibs/utils';

const port = await getFreePort({
  exclude: [3306, 5432, 6379, 27017], // MySQL, PostgreSQL, Redis, MongoDB
});
```

✅ **Handle allocation failures gracefully:**

```typescript
import { getFreePort } from '@tundralibs/utils';

let port: number;
try {
  port = await getFreePort({ min: 3000, max: 3100 });
} catch {
  port = await getFreePort(); // Fallback to default range
}
```

✅ **Use in test setup/teardown:**

```typescript
// Needs a separate install: deno add @tundralibs/compat
import { beforeEach } from '@tundralibs/compat/test';
import { getFreePort } from '@tundralibs/utils';

let testPort: number;

beforeEach(async () => {
  testPort = await getFreePort({ min: 9000, max: 10000 });
});
```

### Don'ts

❌ **Avoid privileged ports without permission:**

```typescript
import { getFreePort } from '@tundralibs/utils';

// BAD: Will fail without elevated privileges
const port = await getFreePort({ min: 1, max: 1023 });
```

❌ **Don't use overly restrictive ranges:**

```typescript
import { getFreePort } from '@tundralibs/utils';

// BAD: High chance of failure
const port = await getFreePort({ min: 3000, max: 3005 }); // Only 6 ports
```

❌ **Don't assume port stays free:**

```typescript
import { getFreePort } from '@tundralibs/utils';

declare function someAsyncOperation(): Promise<void>;
declare function startServer(port: number): void;

// BAD: Race condition
const port = await getFreePort();
await someAsyncOperation(); // Port might be taken now
startServer(port); // Could fail
```

❌ **Don't reuse ports immediately in parallel:**

```typescript
import { getFreePort } from '@tundralibs/utils';

// BAD: Potential conflicts
const parallelPorts = [
  getFreePort(),
  getFreePort(), // Might return same port
  getFreePort(),
];

// BETTER: Exclude previously allocated ports
const excludeList: number[] = [];
const ports: number[] = [];
for (let i = 0; i < 3; i++) {
  const port = await getFreePort({ exclude: excludeList });
  excludeList.push(port);
  ports.push(port);
}
```

## Performance Considerations

- **Random selection** reduces collision probability in parallel scenarios
- **Bounded attempts** prevents infinite loops (typical: 50-300 attempts)
- **Network I/O** for port checking adds ~1-5ms per attempt
- **Expected time**: Usually < 50ms for reasonable ranges

## Common Use Cases

### Development Environment

```typescript
import { getFreePort } from '@tundralibs/utils';

// Auto-assign ports for dev stack
const config = {
  frontend: getFreePort({ min: 3000, max: 4000 }),
  backend: getFreePort({ min: 5000, max: 6000 }),
  database: getFreePort({ min: 27017, max: 27100 }),
};
```

### CI/CD Testing

```typescript
import { getFreePort } from '@tundralibs/utils';

// Parallel test isolation
const testSuitePort = await getFreePort({ min: 9000, max: 10000 });
Deno.env.set('TEST_PORT', testSuitePort.toString());
```

### Docker/Container Port Mapping

```typescript
import { getFreePort } from '@tundralibs/utils';

// Find host port for container mapping
const hostPort = await getFreePort({ min: 30000, max: 32000 });
// docker run -p ${hostPort}:8080 myimage
```

## Error Handling

| Error Type                                         | Cause                        | Resolution                       |
| -------------------------------------------------- | ---------------------------- | -------------------------------- |
| `PortError: Port must be between 0 and 65535`      | Invalid min/max values       | Use valid port range (0-65535)   |
| `PortError: min must be less than or equal to max` | min > max                    | Correct parameter order          |
| `PortError: No free port found`                    | All ports exhausted/excluded | Widen range or reduce exclusions |

## Related

- [IP Utils](./Utils-IpUtils.md) - IP address manipulation and validation
- [Is In Subnet](./Utils-IsInSubnet.md) - Subnet membership checking
- [Events](./Utils-Events.md) - Event emitter for port lifecycle management
- [Config](./Utils-Config.md) - Configuration management for network settings

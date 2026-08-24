# Utils

Essential utility functions and patterns for TypeScript/JavaScript development.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Overview

`utils` is the dependency-free foundation the rest of TundraLibs builds
on: `BaseError` is the root of every package's error hierarchy,
`Options`/`Events` is the base class most config-bearing classes
extend, and `Singleton` backs classes that must have exactly one
instance. Around that core sit small, independent helpers — decorators
(`Once`/`Memoize`/`Throttle`), config/env loading, IP/subnet checks,
syslog parsing, string templating — that have no dependency on each
other or on the core classes; reach for only the ones you need.

`Once`, `Memoize`, and `Throttle` are TC39 standard decorators (no
`experimentalDecorators`). `Memoize` and `Throttle` work on both
methods and getters; `Once` is method-only — decorating a getter with
`@Once` is a compile-time type error, not a supported (if degraded)
case. `Singleton` is also available as its own subpath import
(`@tundralibs/utils/Singleton`) for consumers who only need it.

See [`examples/connection-pool/`](examples/connection-pool/) for a
small runnable app that composes `Options`, `Events`, `BaseError`, and
`Singleton` — the four core pieces — into one class.

Most of the surface — `BaseError`, `Options`/`Events`, `Singleton`,
`Once`/`Memoize`/`Throttle`, `variableReplacer`, IP/subnet helpers —
is pure and runs unchanged on Workers and in the browser; importing
the barrel never throws there. Two exceptions need a real OS to mean
anything: `getFreePort()` binds a real socket to probe availability,
and `Config`/`loadConfig()` reads real files from disk — neither
concept exists in a Worker or a browser, so don't reach for them
there. Prefer the narrow subpath imports (`@tundralibs/utils/BaseError`,
`@tundralibs/utils/Singleton`, …) over the barrel when bundle size for
an edge target matters — the barrel pulls in every module's inert
`node:*` builtin references even when unused (harmless, since they
resolve through a guarded lookup that never throws, but still bytes).

## Installation

**Deno:**

```bash
deno add @tundralibs/utils
```

**Bun:**

```bash
bunx jsr add @tundralibs/utils
```

**Node.js:**

```bash
npx jsr add @tundralibs/utils
```

## Utilities

| Utility                                            | Description                                                           | Documentation                          |
| -------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| [BaseError](docs/Utils-BaseError.md)               | Enhanced error class with context, chaining, and code snippets        | [Docs](docs/Utils-BaseError.md)        |
| [Config](docs/Utils-Config.md)                     | Multi-format configuration loader with environment variable support   | [Docs](docs/Utils-Config.md)           |
| [envArgs](docs/Utils-EnvArgs.md)                   | Environment variable and .env file loader with Docker secrets support | [Docs](docs/Utils-EnvArgs.md)          |
| [Events](docs/Utils-Events.md)                     | Type-safe event system with async support                             | [Docs](docs/Utils-Events.md)           |
| [getFreePort](docs/Utils-GetFreePort.md)           | Find available TCP ports with configurable range and exclusions       | [Docs](docs/Utils-GetFreePort.md)      |
| [ipUtils](docs/Utils-IpUtils.md)                   | IPv4/IPv6 validation, conversion, and range checking utilities        | [Docs](docs/Utils-IpUtils.md)          |
| [isInSubnet](docs/Utils-IsInSubnet.md)             | Check if IP address is within a CIDR subnet range                     | [Docs](docs/Utils-IsInSubnet.md)       |
| [isPublicIP](docs/Utils-IsPublicIP.md)             | Detect if IP address is publicly routable                             | [Docs](docs/Utils-IsPublicIP.md)       |
| [isSubnet](docs/Utils-IsSubnet.md)                 | Validate CIDR subnet notation format                                  | [Docs](docs/Utils-IsSubnet.md)         |
| [memoize](docs/Utils-Memoize.md)                   | Function and method memoization with TTL and async support            | [Docs](docs/Utils-Memoize.md)          |
| [once](docs/Utils-Once.md)                         | Function execution control for single-call enforcement                | [Docs](docs/Utils-Once.md)             |
| [Options](docs/Utils-Options.md)                   | Abstract base class for options and event handling                    | [Docs](docs/Utils-Options.md)          |
| [privateObject](docs/Utils-PrivateObject.md)       | Private data encapsulation utility                                    | [Docs](docs/Utils-PrivateObject.md)    |
| [Singleton](docs/Utils-Singleton.md)               | Singleton pattern decorator                                           | [Docs](docs/Utils-Singleton.md)        |
| [syslog](docs/Utils-Syslog.md)                     | RFC 3164 and RFC 5424 syslog parser and generator                     | [Docs](docs/Utils-Syslog.md)           |
| [templatize](docs/Utils-Templatize.md)             | Type-safe template string parser                                      | [Docs](docs/Utils-Templatize.md)       |
| [throttle](docs/Utils-Throttle.md)                 | Function throttling for rate-limiting execution                       | [Docs](docs/Utils-Throttle.md)         |
| [Types](types/Types.md)                            | Advanced TypeScript utility types for type manipulation               | [Docs](types/Types.md)                 |
| [variableReplacer](docs/Utils-VariableReplacer.md) | Template placeholder replacement with dot notation support            | [Docs](docs/Utils-VariableReplacer.md) |

## Quick Examples

### Network Utilities

```typescript
import { getFreePort, isInSubnet, isPublicIP } from '@tundralibs/utils';

// Find available port for dev server
const port = await getFreePort({ min: 3000, max: 4000 });

// Check if IP is in subnet
if (isInSubnet('192.168.1.10', '192.168.0.0/16')) {
  console.log('IP is in private network');
}

// Detect public vs private IP
if (isPublicIP('8.8.8.8')) {
  console.log('Public IP detected');
}
```

### Configuration Management

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });
const dbHost = config.get<string>('database.host');
```

### Error Handling

```typescript
import { BaseError } from '@tundralibs/utils';

class ValidationError extends BaseError<{ field: string }> {
  // Enhanced error with context
}

throw new ValidationError('Invalid ${field}', { field: 'email' });
```

### Performance Optimization

```typescript
import { memoize, throttle } from '@tundralibs/utils';

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const updateUI = () => console.log('viewport changed');

const expensiveCalc = memoize((n: number) => factorial(n), 5000);
const handleScroll = throttle(() => updateUI(), 100);
```

### Design Patterns

```typescript
import { once, Singleton } from '@tundralibs/utils';

@Singleton
class DatabaseConnection {
  // Ensures single instance
}

const initialize = once(() => {
  // Runs only once
});
```

## License

MIT © TundraLibs

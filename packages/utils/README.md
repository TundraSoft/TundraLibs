# Utils

Core cross-runtime TypeScript building blocks — a typed Options + Events base class, BaseError, Singleton, and helpers for config/env, memoize, throttle, IP/subnet, and free-port lookup.

[![JSR](https://jsr.io/badges/@tundralibs/utils)](https://jsr.io/@tundralibs/utils)
[![JSR Score](https://jsr.io/badges/@tundralibs/utils/score)](https://jsr.io/@tundralibs/utils)
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

See [`examples/connection-pool/`](https://github.com/TundraSoft/TundraLibs/tree/main/packages/utils/examples/connection-pool) for a
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

| Utility                                                                                  | Description                                                           | Documentation                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [BaseError](https://github.com/TundraSoft/TundraLibs/wiki/Utils-BaseError)               | Enhanced error class with context, chaining, and code snippets        | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-BaseError)        |
| [Config](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Config)                     | Multi-format configuration loader with environment variable support   | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Config)           |
| [envArgs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-EnvArgs)                   | Environment variable and .env file loader with Docker secrets support | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-EnvArgs)          |
| [Events](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Events)                     | Type-safe event system with async support                             | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Events)           |
| [getFreePort](https://github.com/TundraSoft/TundraLibs/wiki/Utils-GetFreePort)           | Find available TCP ports with configurable range and exclusions       | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-GetFreePort)      |
| [ipUtils](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IpUtils)                   | IPv4/IPv6 validation, conversion, and range checking utilities        | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IpUtils)          |
| [isInSubnet](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IsInSubnet)             | Check if IP address is within a CIDR subnet range                     | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IsInSubnet)       |
| [isPublicIP](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IsPublicIP)             | Detect if IP address is publicly routable                             | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IsPublicIP)       |
| [isSubnet](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IsSubnet)                 | Validate CIDR subnet notation format                                  | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-IsSubnet)         |
| [memoize](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Memoize)                   | Function and method memoization with TTL and async support            | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Memoize)          |
| [once](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Once)                         | Function execution control for single-call enforcement                | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Once)             |
| [Options](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Options)                   | Abstract base class for options and event handling                    | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Options)          |
| [privateObject](https://github.com/TundraSoft/TundraLibs/wiki/Utils-PrivateObject)       | Private data encapsulation utility                                    | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-PrivateObject)    |
| [Singleton](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Singleton)               | Singleton pattern decorator                                           | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Singleton)        |
| [syslog](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Syslog)                     | RFC 3164 and RFC 5424 syslog parser and generator                     | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Syslog)           |
| [templatize](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Templatize)             | Type-safe template string parser                                      | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Templatize)       |
| [throttle](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Throttle)                 | Function throttling for rate-limiting execution                       | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Throttle)         |
| [Types](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Types)                       | Advanced TypeScript utility types for type manipulation               | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-Types)            |
| [variableReplacer](https://github.com/TundraSoft/TundraLibs/wiki/Utils-VariableReplacer) | Template placeholder replacement with dot notation support            | [Docs](https://github.com/TundraSoft/TundraLibs/wiki/Utils-VariableReplacer) |

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

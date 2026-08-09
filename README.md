# TundraLibs

A suite of independent, cross-runtime TypeScript libraries — every
package works identically on **Deno**, **Bun**, and **Node.js**, and is
published to [JSR](https://jsr.io) under the `@tundralibs` scope.

![Deno 2.0+](https://img.shields.io/badge/Deno-2.0+-000000?logo=deno)
![Bun 1.0+](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun)
![Node.js 22+](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)

[![codecov](https://codecov.io/gh/TundraSoft/TundraLibs/graph/badge.svg)](https://codecov.io/gh/TundraSoft/TundraLibs)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=TundraSoft_TundraLibs&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=TundraSoft_TundraLibs)

## Packages

<!-- workspace:packages:start -->

- **[Ambient](packages/ambient/README.md)** — Cross-runtime request-scoped context over AsyncLocalStorage — correlation/trace ids and custom fields that survive await, no threading
- **[Cacher](packages/cacher/README.md)** — Cross-runtime caching with a unified API over Memory, Redis, and Memcached engines
- **[compat](packages/compat/README.md)** — Compatibility layer smoothing API differences across Deno, Bun, and Node.js
- **[crypt](packages/crypt/README.md)** — Cross-runtime cryptography — hashing, AES/RSA encryption, HMAC/RSA signing, JWT, OTP, key derivation, and secure random
- **[Doctor](packages/doctor/README.md)** — Decorator-driven dependency injection with Singleton, Scoped, and Transient vial lifecycles. The Doctor prescribes vials, dispenses doses, and treats patients.
- **[drivers](packages/drivers/README.md)** — Cross-runtime connection drivers for SQL (PostgreSQL, MariaDB/MySQL, SQLite), MongoDB, Redis, and Memcached
- **[Guardian](packages/guardian/README.md)** — Schema validation for TypeScript — strict at compile time, forgiving at API boundaries
- **[ID](packages/id/README.md)** — Cross-runtime ID generators — CUID/CUID2, ULID, MongoDB ObjectID, and sequential/simple IDs
- **[MetroMan](packages/metro-man/README.md)** — Prometheus-compatible in-process metrics: Counter, Gauge, Histogram, Summary, and a central registry (MetroMan).
- **[NORM](packages/norm/README.md)** — Typed, cross-runtime ORM over OQL and drivers — one schema drives types, validation, relations, migrations, and at-rest column encryption
- **[OQL](packages/oql/README.md)** — Object Query Language - Type-safe, database-agnostic query definitions
- **[Pact](packages/pact/README.md)** — Permissions, Authentication, Control & Tokens — a barebones auth kernel with BigInt-bitmask authorization, JWT/HMAC tokens, and pluggable identity hooks
- **[RadRouter](packages/radrouter/README.md)** — Compressed radix-tree HTTP router — typed parameters, greedy patterns, versioned endpoints, generic middleware
- **[RESTler](packages/restler/README.md)** — Cross-runtime REST API client base class for building typed per-vendor SDKs on Deno, Bun, and Node.js
- **[RPC](packages/rpc/README.md)** — Remote Procedure Call + pub/sub framework over WebSocket — typed request/response, channels, middleware, and pluggable adapters
- **[Slogger](packages/slogger/README.md)** — Cross-runtime structured logging that fans one record out to many formats in-process — console, JSON, syslog, file, HTTP, TCP
- **[Tracer](packages/tracer/README.md)** — Cross-runtime distributed tracing — W3C Trace Context propagation, automatic span nesting via ambient async context, pluggable samplers and exporters
- **[utils](packages/utils/README.md)** — Core TypeScript building blocks — the typed Options + Events base class, BaseError, and shared helpers (config/env, memoize, IP/subnet, free-port)

<!-- workspace:packages:end -->

Each package's README is its main documentation; deeper guides live in
the [wiki](https://github.com/TundraSoft/TundraLibs/wiki).

## Installation

Packages are consumed from JSR in any runtime:

```bash
deno add @tundralibs/<package>      # Deno
bunx jsr add @tundralibs/<package>  # Bun
npx jsr add @tundralibs/<package>   # Node.js
```

## Development

```bash
git clone https://github.com/TundraSoft/TundraLibs.git
cd TundraLibs
bun install        # node_modules for the Bun/Node test runs

deno task test                                    # Deno test suite
bun test packages/                                # Bun
node --import tsx --test 'packages/**/*.test.ts'  # Node.js

deno task fmt && deno task lint && deno task check
```

Create or remove packages with the workspace tool (it also regenerates
every config that enumerates packages):

```bash
deno task workspace:add MyPkg
deno task workspace:remove mypkg
deno task workspace:sync
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the PR workflow (conventional
titles, one package per PR, squash merge) and
[SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Releases

Versioning, changelogs, tags, and JSR publishing are fully automated
from conventional commits (release-please maintains one release PR per
package). Contributors never bump versions by hand.

## License

[MIT](LICENSE)

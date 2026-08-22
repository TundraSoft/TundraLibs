# TundraLibs

A suite of independent, cross-runtime TypeScript libraries — every
package works identically on **Deno**, **Bun** and **Node.js**, and most
also run on **Cloudflare Workers** and in the **browser** (see
[Runtime support](#runtime-support)). Published to
[JSR](https://jsr.io) under the `@tundralibs` scope.

[![Deno 2.0+](https://img.shields.io/badge/Deno-2.0+-000000?logo=deno)](#runtime-support)
[![Bun 1.0+](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun)](#runtime-support)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](#runtime-support)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](#runtime-support)
[![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)](#runtime-support)

[![codecov](https://codecov.io/gh/TundraSoft/TundraLibs/graph/badge.svg)](https://codecov.io/gh/TundraSoft/TundraLibs)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=TundraSoft_TundraLibs&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=TundraSoft_TundraLibs)

## Packages

<!-- workspace:packages:start -->

- **[Ambient](packages/ambient/README.md)** — Cross-runtime request-scoped context over AsyncLocalStorage — correlation/trace ids and custom fields that survive await, no threading
- **[Cacher](packages/cacher/README.md)** — Cross-runtime caching with a unified API over Memory, Redis, and Memcached engines
- **[compat](packages/compat/README.md)** — Compatibility layer smoothing API differences across Deno, Bun, and Node.js
- **[Cronus](packages/cronus/README.md)** — Cross-runtime minute-resolution cron scheduler — tick-and-match (impossible expressions never crash), per-job overlap prevention, cron/run-once/run-now triggers.
- **[crypt](packages/crypt/README.md)** — Cross-runtime cryptography — hashing, AES/RSA encryption, HMAC/RSA signing, JWT, OTP, key derivation, and secure random
- **[Doctor](packages/doctor/README.md)** — Lightweight dependency injection with Singleton, Scoped, and Transient vial lifecycles — TC39 decorators, typed inject() tokens, no reflect-metadata
- **[drivers](packages/drivers/README.md)** — Cross-runtime connection drivers for SQL (PostgreSQL, MariaDB/MySQL, SQLite), MongoDB, Redis, and Memcached — plus edge/serverless HTTP dialects (Neon, Turso, Cloudflare D1)
- **[Guardian](packages/guardian/README.md)** — Schema validation for TypeScript — strict at compile time, forgiving at API boundaries
- **[ID](packages/id/README.md)** — Cross-runtime ID generators — NanoID, CUID/CUID2, ULID, MongoDB ObjectID, and sequential/simple IDs
- **[MetroMan](packages/metro-man/README.md)** — Prometheus-compatible in-process metrics: Counter, Gauge, Histogram, Summary, and a central registry (MetroMan).
- **[NORM](packages/norm/README.md)** — Typed, cross-runtime ORM over OQL and drivers — one schema drives types, validation, relations, migrations, and at-rest column encryption
- **[OQL](packages/oql/README.md)** — Object Query Language — type-safe, database-agnostic query definitions
- **[Pact](packages/pact/README.md)** — Permissions, Authentication, Control & Tokens — a barebones auth kernel with BigInt-bitmask authorization, JWT/HMAC tokens, and pluggable identity hooks
- **[RadRouter](packages/radrouter/README.md)** — Compressed radix-tree HTTP router — typed parameters, greedy patterns, versioned endpoints, generic middleware
- **[RESTler](packages/restler/README.md)** — Cross-runtime REST API client base class for building typed per-vendor SDKs on Deno, Bun, and Node.js
- **[RPC](packages/rpc/README.md)** — Remote Procedure Call + pub/sub framework over WebSocket — typed request/response, channels, middleware, and pluggable adapters
- **[Slogger](packages/slogger/README.md)** — Cross-runtime structured logging that fans one record out to many formats in-process — console, JSON, syslog, file, HTTP, TCP, or any custom handler
- **[Tracer](packages/tracer/README.md)** — Cross-runtime distributed tracing — W3C Trace Context propagation, automatic span nesting via ambient async context, pluggable samplers and exporters
- **[utils](packages/utils/README.md)** — Core TypeScript building blocks — the typed Options + Events base class, BaseError, Singleton, and shared helpers (config/env, memoize, IP/subnet, free-port)

<!-- workspace:packages:end -->

Each package's README is its main documentation; deeper guides live in
the [wiki](https://github.com/TundraSoft/TundraLibs/wiki).

## Runtime support

Every package runs on **Deno**, **Bun** and **Node.js**. Most also run on
**Cloudflare Workers** and in a **browser** — the exceptions are listed
below, along with exactly what is unavailable and why.

Verified by running each package's real operations on
`workerd 1.20260811.1` (`nodejs_compat`, compatibility date `2026-08-04`)
and in Chrome via Vite, not by inspecting imports.

| Package                                   | Deno | Bun | Node | Workers | Browser | Not available                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | :--: | :-: | :--: | :-----: | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ambient](packages/ambient/README.md)     |  ✅  | ✅  |  ✅  |   ✅    |   ❌    | **Browser:** no `AsyncLocalStorage`, so `createContext()` throws. `ambient.get()` outside a scope returns `undefined` rather than throwing.                                                                                                                                                                                                                                                                                                                                                                                          |
| [cacher](packages/cacher/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ⚠️    | **Browser:** Memory engine only — Redis and Memcached need TCP.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [compat](packages/compat/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ⚠️    | **Browser:** `./net`, `./file`, `./udp`, `./webserver`, `./websocket` and `./watch` throw `UnsupportedRuntimeError`. `./runtime`, `./fetch`, `./http`, `./path`, `./common`, `./permissions` and `./cli` all work. **Workers:** `./udp` is unsupported.                                                                                                                                                                                                                                                                              |
| [cronus](packages/cronus/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [crypt](packages/crypt/README.md)         |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [doctor](packages/doctor/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [drivers](packages/drivers/README.md)     |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | Import engines by subpath. **Workers:** Postgres, MariaDB, Redis and Memcached all work — their sockets go through `cloudflare:sockets` (needs `nodejs_compat`; the target must be reachable under Cloudflare's outbound policy) — and the HTTP dialects `./d1`/`./neon`/`./turso` work directly. Unavailable: `./sqlite` (native binding) and `./mongo` (native `npm:mongodb` driver, not `cloudflare:sockets`). **Browser:** `./d1`, `./neon` and `./turso` only — the rest need TCP, and `./mongo` / `./maria` need Node globals. |
| [guardian](packages/guardian/README.md)   |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [id](packages/id/README.md)               |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [metro-man](packages/metro-man/README.md) |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [norm](packages/norm/README.md)           |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | The root entry registers every dialect and is **server-only**. On Workers and in a browser use `@tundralibs/norm/core` plus one of `./engines/d1`, `./engines/neon` or `./engines/turso`.                                                                                                                                                                                                                                                                                                                                            |
| [oql](packages/oql/README.md)             |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [pact](packages/pact/README.md)           |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [radrouter](packages/radrouter/README.md) |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [restler](packages/restler/README.md)     |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [rpc](packages/rpc/README.md)             |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | `Client` works everywhere. **`Server` needs a host runtime** — it cannot listen on Workers or in a browser. `./conformance` is test-only and never bundles.                                                                                                                                                                                                                                                                                                                                                                          |
| [slogger](packages/slogger/README.md)     |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | Console, Memory and HTTP handlers work everywhere. **File, TCP and Syslog need a host runtime.** On Workers a `/tmp` file path writes to an ephemeral in-memory filesystem — records are lost when the isolate recycles, and the handler warns.                                                                                                                                                                                                                                                                                      |
| [tracer](packages/tracer/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ⚠️    | **Browser:** manual `startSpan` + export and the read-only `active`/`get` degrade fine, but the ergonomic auto-nesting path — `startActiveSpan` / `run` and the `wrap` / `wrapClient` witnesses — throws, since a plain browser has no `AsyncLocalStorage`.                                                                                                                                                                                                                                                                          |
| [utils](packages/utils/README.md)         |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

✅ everything works · ⚠️ works with the limits noted · ❌ not supported

**Two things worth knowing.** Raw TCP _does_ work on Cloudflare Workers via
`cloudflare:sockets`, so the Postgres, MariaDB, Redis and Memcached engines are
usable there when the target is reachable under Cloudflare's outbound policy.
And a browser has no filesystem, no TCP and no UDP — anything built on those
throws `UnsupportedRuntimeError` rather than failing silently.

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

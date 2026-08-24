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
- **[Pact](packages/pact/README.md)** — Permissions, Authentication, Control & Tokens — a transport-agnostic auth toolkit with BigInt-bitmask authorization, flat storage hooks, five credential schemes, refresh-token rotation, TOTP, and an OAuth2/OIDC client
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

| Package                                   | Deno | Bun | Node | Workers | Browser | Not available                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | :--: | :-: | :--: | :-----: | :-----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ambient](packages/ambient/README.md)     |  ✅  | ✅  |  ✅  |   ✅    |   ❌    | **Browser:** no `AsyncLocalStorage`, so `createContext()` throws. `ambient.get()` outside a scope returns `undefined` rather than throwing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [cacher](packages/cacher/README.md)       |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | Memory engine works everywhere. **Workers:** Redis and Memcached connect directly on `cloudflare:sockets` via `compat/net` — no `nodejs_compat` flag needed. **Browser:** Memory only — Redis and Memcached need real TCP, which a browser does not have.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [compat](packages/compat/README.md)       |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | **Workers (since 2.6.0):** outbound TCP/TLS (`net.connect`/`upgradeTls`) runs directly on `cloudflare:sockets` — no `nodejs_compat` flag needed. File I/O under `/tmp` runs on `node:fs`, which does need `nodejs_compat` (`makeTempFile`/`makeTempDir` also need `{ allowEphemeral: true }`). `WebSocketServer.handleUpgrade()` works either way. Still unsupported: `net.listen()`, `./udp`, `./watch`, `WebServer.start()`/`.listen()`, `./cli`'s subprocess spawning, and `file`'s directory/copy/move/rename/`realPath`/`openFile` ops. **Browser:** all of the above throw, plus `./websocket` entirely; `./runtime`, `./fetch`, `./http`, `./path`, `./common` and `./permissions` work. |
| [cronus](packages/cronus/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [crypt](packages/crypt/README.md)         |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [doctor](packages/doctor/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [drivers](packages/drivers/README.md)     |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | Import engines by subpath. **Workers:** Postgres, Redis and Memcached connect directly on `cloudflare:sockets` via `compat/net` — no `nodejs_compat` flag needed. MariaDB also connects, but via a different path: `nodejs_compat` shims `node:net` for the third-party `mariadb` driver. The fetch-based `./d1`, `./neon` and `./turso` work unchanged. `./sqlite` needs a native binding (unavailable); `./mongo` is unverified — never tested on workerd. **Browser:** only `./d1`, `./neon` and `./turso` — the rest need real TCP or Node globals a browser doesn't have.                                                                                                                  |
| [guardian](packages/guardian/README.md)   |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [id](packages/id/README.md)               |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [metro-man](packages/metro-man/README.md) |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [norm](packages/norm/README.md)           |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | The root barrel registers six of the seven dialects — every one but `sqlite`, which needs its own `import '@tundralibs/norm/engines/sqlite'`. **Workers:** `./postgres` and `./maria` genuinely connect (same mechanisms as `drivers`, above), and so do the fetch-only `./d1`/`./neon`/`./turso`; `./mongo` is unverified, `./sqlite` never runs there. **Browser:** the barrel itself bundles fine (verified with a real esbuild build) — only the fetch-only trio can actually connect, since a browser has no raw sockets for `postgres`/`maria` to use.                                                                                                                                    |
| [oql](packages/oql/README.md)             |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [pact](packages/pact/README.md)           |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [radrouter](packages/radrouter/README.md) |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [restler](packages/restler/README.md)     |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [rpc](packages/rpc/README.md)             |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | `Client` works everywhere. **Workers:** `Server` serves connections via `handleUpgrade(request)` from a `fetch` handler — commands, middleware and channels all work; cross-connection `publish()` fan-out does not (each connection is pinned to its own request's I/O context — the drop now surfaces via `onSendError` instead of vanishing silently), and real fan-out needs a Durable Object this package doesn't provide. `listen()`/`handlers()` still need a host runtime. **Browser:** `Server` cannot run at all — `Client` is what a browser uses. `./conformance` is test-only and never bundles.                                                                                   |
| [slogger](packages/slogger/README.md)     |  ✅  | ✅  |  ✅  |   ⚠️    |   ⚠️    | Console, Memory and HTTP handlers work everywhere. **Workers:** `TCPHandler` and `SyslogHandler`'s TCP transport connect via `compat/net`'s `cloudflare:sockets` — no `nodejs_compat` flag needed. `FileHandler` also works — reads/writes land in workerd's `/tmp` — but a record is gone by the very next request, not merely when the isolate eventually recycles; the handler detects this at open and warns once per instance. `SyslogHandler`'s UDP transport doesn't work (Workers has no UDP), and neither does its UNIX transport (`compat/net` disallows UNIX sockets on Workers). **Browser:** no filesystem or raw socket — File, TCP and Syslog all throw.                         |
| [tracer](packages/tracer/README.md)       |  ✅  | ✅  |  ✅  |   ✅    |   ⚠️    | **Browser:** manual `startSpan` + export and the read-only `active`/`get` degrade fine, but the ergonomic auto-nesting path — `startActiveSpan` / `run` and the `wrap` / `wrapClient` witnesses — throws, since a plain browser has no `AsyncLocalStorage`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [utils](packages/utils/README.md)         |  ✅  | ✅  |  ✅  |   ✅    |   ✅    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

✅ everything works · ⚠️ works with the limits noted · ❌ not supported

**Two things worth knowing.** Outbound TCP/TLS genuinely works on Cloudflare
Workers, confirmed two independent ways, with two different flag requirements:
`compat/net` connects directly on `cloudflare:sockets` (since 2.6.0) — no
`nodejs_compat` flag needed — which is what `postgres`/`redis`/`memcached` use;
a driver that manages its own sockets instead, like `drivers/maria`'s
third-party `mariadb` client, reaches the same result through Cloudflare's
`nodejs_compat` `node:net` shim, entirely independent of `compat`. Neither path
exists in a browser: no filesystem, no TCP and no UDP there — anything built on
those throws `UnsupportedRuntimeError` rather than failing silently.

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

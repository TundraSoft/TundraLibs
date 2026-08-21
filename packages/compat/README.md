# Compat

Cross-runtime compatibility layer for Bun, Deno, and Node.js.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

The `@tundralibs/compat` package provides unified APIs that work consistently across Bun, Deno, and Node.js runtimes. Write your code once and run it anywhere.

## Modules

| Module                                           | Description                                                        | Documentation                              |
| ------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------ |
| [WebServer](webserver/Compat-WebServer.md)       | HTTP/HTTPS + WebSocket server (all 3 runtimes)                     | [Full Docs](webserver/Compat-WebServer.md) |
| [WebSocketServer](websocket/Compat-WebSocket.md) | Middleware-aware WebSocket primitive (codec, broadcast, lifecycle) | [Docs](websocket/Compat-WebSocket.md)      |
| [Common](docs/Compat-Common.md)                  | TLS types, error classes                                           | [Docs](docs/Compat-Common.md)              |
| [Runtime](docs/Compat-Runtime.md)                | Runtime detection, OS/arch, env, signals, memory                   | [Docs](docs/Compat-Runtime.md)             |
| [CLI](docs/Compat-Cli.md)                        | Args/argv, terminal, prompt, progress, spinner                     | [Docs](docs/Compat-Cli.md)                 |
| [File](docs/Compat-File.md)                      | File system operations                                             | [Docs](docs/Compat-File.md)                |
| [Watch](docs/Compat-Watch.md)                    | Cross-runtime filesystem watching                                  | [Docs](docs/Compat-Watch.md)               |
| [Net](docs/Compat-Net.md)                        | Networking utilities                                               | [Docs](docs/Compat-Net.md)                 |
| [Path](docs/Compat-Path.md)                      | Path utilities                                                     | [Docs](docs/Compat-Path.md)                |
| [Permissions](docs/Compat-Permissions.md)        | Permission checking                                                | [Docs](docs/Compat-Permissions.md)         |
| [Test](docs/Compat-Test.md)                      | Testing utilities                                                  | [Docs](docs/Compat-Test.md)                |
| [Bench](docs/Compat-Bench.md)                    | Cross-runtime micro-benchmark harness                              | [Docs](docs/Compat-Bench.md)               |
| [Fetch](docs/Compat-Fetch.md)                    | HTTP client utilities                                              | [Docs](docs/Compat-Fetch.md)               |

## Browser / Cloudflare Workers support

No blanket badge — compat's whole job is smoothing over **Bun / Deno /
Node.js**, and most of its modules wrap concepts (a listening TCP
socket, a real filesystem, a terminal) that don't exist in a browser
or a standard Worker, not something compat itself could paper over.

`runtime` detects both targets: `RUNTIME` reports `'WORKERS'` (Cloudflare
Workers / workerd) and `'BROWSER'`, with `isWorkers` / `isBrowser` flags.
Cloudflare Workers under `nodejs_compat` exposes `process.versions.node`,
so `isNode` deliberately **excludes** it — every module either works,
returns a documented safe fallback, or throws `UnsupportedRuntimeError`;
none TypeErrors on a missing built-in. Per module:

| Module                        | Browser / Workers | Why                                                                                                                                                                                                                                                                                   |
| ----------------------------- | :---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`                       |        ✅         | Wraps the native `fetch` global directly.                                                                                                                                                                                                                                             |
| `path`                        |        ✅         | Pure string manipulation, no I/O.                                                                                                                                                                                                                                                     |
| `common` (TLS types, errors)  |        ✅         | Types and error classes only.                                                                                                                                                                                                                                                         |
| `runtime`                     |        ✅         | Detects `'WORKERS'` / `'BROWSER'`; `isWorkers` / `isBrowser` flags. Informational helpers return safe fallbacks (`cpus() → 1`, `cwd() → ''`, `getEnv() → {}` or `process.env` on Workers, `on*` no-op); `exit()` throws.                                                              |
| `file`, `watch`, `net`, `udp` |      throws       | Need a real filesystem or raw TCP/UDP socket. Each public entry throws `UnsupportedRuntimeError` (not a `TypeError`) when the backing built-in is absent.                                                                                                                             |
| `webserver`, `websocket`      |      throws       | `new WebServer(...)` constructs fine; `start()` throws `UnsupportedRuntimeError`. The Node path loads the `ws` npm package lazily on start (never at import), so importing the module is bundle-safe. A browser/Workers **client** should use the native `WebSocket` global directly. |
| `permissions`, `cli`          |       mixed       | `cli` prompts (`prompt`/`choose`) throw `UnsupportedRuntimeError` rather than fake a terminal; `permissions` reports `'GRANTED'` (no permission system to consult).                                                                                                                   |

## Installation

**Deno:**

```bash
deno add @tundralibs/compat
```

**Bun:**

```bash
bunx jsr add @tundralibs/compat
```

**Node.js:**

```bash
npx jsr add @tundralibs/compat
```

### Import

```typescript
// Import entire module
import * as compat from '@tundralibs/compat';

// Import specific modules
import { WebServer } from '@tundralibs/compat/webserver';
import { isBun, isDeno, isNode, RUNTIME } from '@tundralibs/compat/runtime';
import { readTextFile, writeTextFile } from '@tundralibs/compat/file';
import { connect, hostname, listen, upgradeTls } from '@tundralibs/compat/net';
import { argv, ProgressBar, prompt, Spinner } from '@tundralibs/compat/cli';
import { watch } from '@tundralibs/compat/watch';
```

**Direct import (Deno):**

```typescript
import { WebServer } from 'jsr:@tundralibs/compat/webserver';
import { RUNTIME } from 'jsr:@tundralibs/compat/runtime';
```

## Quick Start

### Runtime Detection

```typescript
import { isBun, isDeno, isNode, RUNTIME } from '@tundralibs/compat/runtime';

console.log(`Running on: ${RUNTIME}`);
// Output: "Running on: DENO" or "BUN" or "NODE"

if (isDeno) {
  console.log('Deno-specific code');
} else if (isBun) {
  console.log('Bun-specific code');
} else if (isNode) {
  console.log('Node.js-specific code');
}
```

### File Operations

```typescript
import {
  isDirectory,
  isFile,
  pathExists,
  readTextFile,
  writeTextFile,
} from '@tundralibs/compat/file';

// Read file
const content = await readTextFile('./config.json');

// Write file
await writeTextFile('./output.txt', 'Hello World');

// Check existence
if (await pathExists('./data')) {
  console.log('Data directory exists');
}
```

### HTTP Server

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('MyAPI', {
  mode: 'TCP',
  port: 8080,
  handler: (request, info) => {
    return new Response(`Hello from ${info.requestId}`);
  },
});

server.on('onStart', (name) => {
  console.log(`${name} listening on ${server.address}`);
});

server.start();
```

### Testing

```typescript
import { describe, it } from '@tundralibs/compat/test';
import { strictEqual } from 'node:assert';

describe('Math operations', () => {
  it('should add numbers', () => {
    strictEqual(1 + 1, 2);
  });

  it('should handle async', async () => {
    const result = await Promise.resolve(42);
    strictEqual(result, 42);
  });
});
```

## Compatibility Matrix

| Feature                            | Bun | Deno | Node.js |
| ---------------------------------- | --- | ---- | ------- |
| Runtime / OS / arch detection      | ✅  | ✅   | ✅      |
| Process info (pid, env, cwd)       | ✅  | ✅   | ✅      |
| Process exit + signals             | ✅  | ✅   | ✅      |
| System resources (cpu/mem/uptime)  | ✅  | ✅\* | ✅      |
| File operations                    | ✅  | ✅   | ✅      |
| Filesystem watching                | ✅  | ✅   | ✅‡     |
| Networking utilities               | ✅  | ✅   | ✅      |
| Path utilities                     | ✅  | ✅   | ✅      |
| HTTP Server                        | ✅  | ✅   | ✅      |
| WebSocket                          | ✅  | ✅   | ✅¶     |
| Permission checks                  | ✅  | ✅   | ✅**    |
| Testing utilities                  | ✅  | ✅   | ✅      |
| TLS upgrade (STARTTLS)             | ✅  | ✅   | ✅      |
| `rejectUnauthorized: false`        | ✅  | ❌†  | ✅      |
| CLI args + prompt + widgets        | ✅  | ✅   | ✅      |
| WS middleware + codecs + broadcast | ✅  | ✅   | ✅      |

\*`memoryUsage().arrayBuffers` is `0` on Deno (the runtime doesn't expose it).\
\*\*Node.js permissions always return `true` (no permission system).\
†Deno requires `--unsafely-ignore-certificate-errors=hostname` CLI flag.\
‡Recursive watching on Linux requires Node 20+; older Node throws.\
¶Node.js WebSocket built on the `ws` npm package (normal dependency, pure-JS, no native deps).

## Dependencies policy

`@tundralibs/compat` ships with one runtime npm dep — `ws` — used only
on Node.js to provide the WebSocket server (Bun and Deno use their
native primitives and don't load it).

The package may take additional npm deps in the future where:

1. There's a genuine cross-runtime gap that can't be filled with
   `node:*` builtins or runtime globals,
2. The dep is small, mature, widely-used, and pure-JS (no native
   binaries — keeps deployment simple),
3. The dep is loaded only on the runtime that needs it.

Bun and Deno paths through compat must remain free of npm deps unless
no `node:`/native alternative exists.

## Module Details

### WebServer

Full-featured HTTP/HTTPS server with WebSocket support.

- TCP and UNIX socket modes
- TLS/HTTPS with file or string certificates
- WebSocket on all three runtimes — Bun + Deno native, Node via `ws`
- Typed connection state via the upgrade hook (`WebServer<T>`)
- Subprotocol selection, `bufferedAmount` for backpressure
- Request metrics and analytics
- Event-driven architecture
- Graceful shutdown

```typescript
import { WebServer } from '@tundralibs/compat/webserver';
```

**[→ Full WebServer Documentation](webserver/Compat-WebServer.md)**

### Common

Shared TLS types and error classes used by Fetch and Net. These are
available from the `./common` sub-path and re-exported from the package
root.

```typescript
import {
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
  FetchTLSError,
  type TLSOptions,
} from '@tundralibs/compat';
```

**[→ Common Documentation](docs/Compat-Common.md)**

### Runtime

Runtime detection, OS / architecture info, environment access, process
event handlers and signals, and system-resource probes (CPU count, total
/ free memory, uptime, per-process memory usage).

```typescript
import {
  ARCH,
  cpus,
  exit,
  freemem,
  getEnv,
  isBun,
  isDeno,
  isNode,
  memoryUsage,
  onSignal,
  RUNTIME,
  totalmem,
  uptime,
} from '@tundralibs/compat/runtime';
```

**[→ Runtime Documentation](docs/Compat-Runtime.md)**

### CLI

CLI argument access and parsing, terminal info, line-based prompts, and
in-place display widgets (progress bar, spinner). Each piece is small
and standalone — pull just what you need.

```typescript
import {
  argv,
  choose,
  consoleSize,
  isTTY,
  ProgressBar,
  prompt,
  Spinner,
} from '@tundralibs/compat/cli';
```

**[→ CLI Documentation](docs/Compat-Cli.md)**

### File

Cross-runtime file system operations.

```typescript
import {
  isDirectory,
  isDirectorySync,
  isFile,
  isFileSync,
  pathExists,
  pathExistsSync,
  readTextFile,
  readTextFileSync,
  remove,
  removeSync,
  writeTextFile,
  writeTextFileSync,
} from '@tundralibs/compat/file';
```

**[→ File Documentation](docs/Compat-File.md)**

### Watch

Filesystem watching with a single async-iterable API and normalized
event kinds. Deno reports distinct create/modify/remove/rename;
Node and Bun's `fs.watch` is lossier (everything but `'change'` is
reported as `'rename'`).

```typescript
import { watch } from '@tundralibs/compat/watch';

const w = watch('./src', { recursive: true });
for await (const ev of w) {
  console.log(ev.kind, ev.paths);
}
```

**[→ Watch Documentation](docs/Compat-Watch.md)**

### WebSocketServer

Middleware-aware WebSocket server primitive on top of the WebServer's
WebSocket support: Koa-style middleware over every incoming message, a
pluggable codec (string identity by default; `JsonCodec` / `BinaryCodec`
ship alongside), lifecycle hooks, connection tracking, and single-call
broadcast. Mount it onto an existing `WebServer` or run it standalone.

It is intentionally opinion-light — no command dispatch, channels, or
pub/sub. For a higher-level RPC + pub/sub layer built on this primitive,
see `@tundralibs/rpc`.

```typescript
import { WebSocketServer } from '@tundralibs/compat/websocket';

// Your own auth check.
const verifyToken = (header: string | null): string | null =>
  header?.startsWith('Bearer ') ? header.slice(7) : null;

const wss = new WebSocketServer<{ userId: string }>({
  upgrade: (req) => {
    const userId = verifyToken(req.headers.get('authorization'));
    return userId ? { data: { userId } } : false;
  },
});

wss.use(async (ctx, next) => {
  console.log(`message from ${ctx.ws.data.userId}`);
  await next();
});

wss.onMessage((ctx) => ctx.ws.send(`echo: ${ctx.message}`));

// Mount onto an existing WebServer:
//   websocket: wss.handlers()
// Or run standalone:
await wss.listen({ port: 8080 });
```

**[→ WebSocketServer Documentation](websocket/Compat-WebSocket.md)**

### Net

Cross-runtime networking utilities.

```typescript
import { connect, hostname, listen, upgradeTls } from '@tundralibs/compat/net';

// Create TCP listener
const listener = await listen({ port: 8080 });
listener.close();

// Connect to remote host
const conn = await connect({ hostname: 'example.com', port: 80 });
await conn.write('GET / HTTP/1.1\r\n\r\n');
conn.close();

// Upgrade plain TCP connection to TLS (e.g. Postgres SSLRequest, SMTP STARTTLS)
const tlsConn = await upgradeTls(conn, {
  hostname: 'db.example.com',
  tls: true,
});

// Get hostname
const host = hostname();
```

**[→ Net Documentation](docs/Compat-Net.md)**

### Path

Path manipulation utilities.

```typescript
import * as path from '@tundralibs/compat/path';

path.join('foo', 'bar', 'baz'); // 'foo/bar/baz'
path.dirname('/foo/bar/baz'); // '/foo/bar'
path.basename('/foo/bar/baz'); // 'baz'
path.extname('file.txt'); // '.txt'
```

**[→ Path Documentation](docs/Compat-Path.md)**

### Permissions

Check runtime permissions (Deno) or simulate (Bun/Node).

```typescript
import {
  hasPermission,
  hasPermissionSync,
} from '@tundralibs/compat/permissions';

const canRead = await hasPermission({ name: 'read', path: './data' });
const canWrite = hasPermissionSync({ name: 'write', path: './output' });
```

**[→ Permissions Documentation](docs/Compat-Permissions.md)**

### Test

Cross-runtime testing utilities. Available on the `./test` sub-path only —
the package root does not re-export them, because the module imports
`bun:test` and `node:test` and bundlers such as esbuild cannot resolve
those, which would break every Cloudflare Workers build.

```typescript
import { afterEach, beforeEach, describe, it } from '@tundralibs/compat/test';
```

**[→ Test Documentation](docs/Compat-Test.md)**

## Error Handling

All modules use `CompatError` as the base class for consistent error handling:

```typescript
import {
  CompatError,
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
} from '@tundralibs/compat';

try {
  // compat operation
} catch (error) {
  if (error instanceof FetchPathTraversalError) {
    console.error('SECURITY: Path traversal attempt:', error.path);
  } else if (error instanceof FetchFileNotFoundError) {
    console.error('Missing file:', error.path);
  } else if (error instanceof FetchInvalidPEMError) {
    console.error('Invalid PEM in', error.source);
  } else if (error instanceof CompatError) {
    console.error(error.toJSON());
  }
}
```

## Contributing

See the main [TundraLibs Contributing Guide](../../CONTRIBUTING.md).

## License

MIT

# Compat-Runtime

Cross-runtime detection and environment information.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

The Runtime module provides reliable detection of the current JavaScript runtime and operating system, along with utilities for accessing environment information in a cross-runtime compatible way.

### Features

| Feature             | Bun | Deno | Node.js | Workers | Browser |
| ------------------- | --- | ---- | ------- | ------- | ------- |
| Runtime detection   | ✅  | ✅   | ✅      | ✅      | ✅      |
| OS detection        | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| CPU architecture    | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Environment vars    | ✅  | ✅   | ✅      | ✅†     | ⬜      |
| Process ID          | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Process exit        | ✅  | ✅   | ✅      | ❌      | ❌      |
| Working directory   | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Exit handler        | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Error handler       | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Unhandled rejection | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Signal handler      | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| CPU count           | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Memory totals       | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| System uptime       | ✅  | ✅   | ✅      | ⬜      | ⬜      |
| Memory usage        | ✅  | ✅\* | ✅      | ⬜      | ⬜      |

\* Deno's `Deno.memoryUsage()` does not expose `arrayBuffers`; the field is reported as `0`.

† On Workers, `getEnv()` returns `process.env` when `nodejs_compat` populates it, else `{}`.

Legend: ✅ works · ⬜ returns a safe fallback (`0`, `1`, `''`, `{}`, no-op) · ❌ throws.

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

## API Reference

### Runtime Detection

#### Constants

```typescript ignore
const RUNTIME: Runtime; // 'DENO' | 'BUN' | 'NODE' | 'WORKERS' | 'BROWSER' | 'UNKNOWN'
const isDeno: boolean; // true if running in Deno
const isBun: boolean; // true if running in Bun
const isNode: boolean; // true if GENUINE Node (excludes workerd)
const isWorkers: boolean; // true if running on Cloudflare Workers (workerd)
const isBrowser: boolean; // true if a browser or web/service worker
```

`isNode` is **genuine Node only**. Cloudflare Workers under `nodejs_compat`
exposes `process.versions.node`, so it would otherwise masquerade as Node;
`isWorkers` is checked first and `isNode` excludes it. This is what makes a
Node-gated builtin (`node:http`, `node:fs`, …) that workerd does not provide
surface as an `UnsupportedRuntimeError` rather than a raw `TypeError`.

**Example:**

```typescript
import { isBun, isDeno, isNode, RUNTIME } from '@tundralibs/compat/runtime';

console.log(`Running on: ${RUNTIME}`);

if (isDeno) {
  console.log('Deno-specific code');
} else if (isBun) {
  console.log('Bun-specific code');
} else if (isNode) {
  console.log('Node.js-specific code');
}
```

#### `getRuntime()`

Gets the current runtime.

```typescript ignore
function getRuntime(): Runtime;
function detectRuntime(globals?: object): Runtime;

type Runtime = 'DENO' | 'BUN' | 'NODE' | 'WORKERS' | 'BROWSER' | 'UNKNOWN';
```

`getRuntime()` is `detectRuntime(globalThis)`. `detectRuntime` is pure —
pass a fake `globals` object to test any outcome without the real runtime.

**Detection Order:**

1. Deno — `globalThis.Deno`
2. Bun — `globalThis.Bun`
3. Workers — `navigator.userAgent === 'Cloudflare-Workers'` (checked before
   Node, since workerd also exposes `process.versions.node`)
4. Node.js — `process.versions.node`
5. Browser — `document`, or a worker global scope (`WorkerGlobalScope` /
   `importScripts`)
6. Unknown — if none match

A jsdom-under-Node environment carries both `document` and
`process.versions.node`; the Node test wins, so it stays `'NODE'`.

**Example:**

```typescript
import { getRuntime } from '@tundralibs/compat/runtime';

const runtime = getRuntime();
switch (runtime) {
  case 'DENO':
    console.log('Using Deno APIs');
    break;
  case 'BUN':
    console.log('Using Bun APIs');
    break;
  case 'NODE':
    console.log('Using Node.js APIs');
    break;
  case 'WORKERS':
    console.log('Cloudflare Workers — fetch-style APIs only');
    break;
  case 'BROWSER':
    console.log('Browser or web worker');
    break;
}
```

### Workers and browsers

On `'WORKERS'` and `'BROWSER'` the informational helpers return safe
fallbacks rather than throwing: `cpus() → 1`, `totalmem()`/`freemem()`/
`uptime() → 0`, `cwd() → ''`, `getProcessId() → undefined`, `memoryUsage()`
→ all-zero, and the `on*` handler registrations are no-ops. `getEnv()`
returns `{}` — except on Workers, where it returns `process.env` when
`nodejs_compat` has populated it. `exit()` throws (there is no process to
exit).

Capability-backed operations that need a primitive the runtime lacks throw
[`UnsupportedRuntimeError`](Compat-Common.md#unsupportedruntimeerror) instead
of a raw `TypeError`: the whole of `file` (filesystem), `net`/`udp`
(sockets), `watch` (file watching), `webserver`'s `start()` (a
port-listening server), and the interactive `cli` prompts. Feature-detect
with `isWorkers` / `isBrowser` (or `RUNTIME`) and avoid those paths, or
catch the error.

### Operating System Detection

#### Constants

```typescript ignore
const OS: OperatingSystem; // 'WINDOWS' | 'LINUX' | 'DARWIN' | 'UNKNOWN'
```

**Example:**

```typescript
import { OS } from '@tundralibs/compat/runtime';

if (OS === 'WINDOWS') {
  console.log('Running on Windows');
} else if (OS === 'DARWIN') {
  console.log('Running on macOS');
}
```

#### `getOS()`

Gets the current operating system.

```typescript ignore
function getOS(): OperatingSystem;

type OperatingSystem = 'WINDOWS' | 'LINUX' | 'DARWIN' | 'UNKNOWN';
```

**Platform Mapping:**

- `'windows'` / `'win32'` → `'WINDOWS'`
- `'linux'` → `'LINUX'`
- `'darwin'` → `'DARWIN'`
- Others → `'UNKNOWN'`

**Example:**

```typescript
import { getOS } from '@tundralibs/compat/runtime';

const os = getOS();
const pathSeparator = os === 'WINDOWS' ? '\\' : '/';
```

### CPU Architecture

#### Constants

```typescript ignore
const ARCH: Architecture; // 'X64' | 'ARM64' | 'X86' | 'ARM' | 'UNKNOWN'
```

`Architecture` is the normalized union — Deno's `x86_64`/`aarch64` and
Node/Bun's `x64`/`arm64`/`ia32`/`arm` collapse to the same uppercase
labels. Anything else (`ppc`, `mips`, `riscv64`, `s390x`, …) becomes
`'UNKNOWN'`.

**Example:**

```typescript
import { ARCH } from '@tundralibs/compat/runtime';

declare function loadNative(lib: string): void;

if (ARCH === 'ARM64') {
  loadNative('libfoo.aarch64.so');
} else if (ARCH === 'X64') {
  loadNative('libfoo.x86_64.so');
}
```

#### `getArch()`

Function form for callers that prefer a call over the constant.

```typescript ignore
function getArch(): Architecture;
```

### Process Information

#### `getProcessId()`

Gets the current process ID.

```typescript ignore
function getProcessId(): number | undefined;

const PID: number | undefined; // Constant form
```

**Example:**

```typescript
import { getProcessId, PID } from '@tundralibs/compat/runtime';

console.log(`Process ID: ${PID}`);
// or
console.log(`Process ID: ${getProcessId()}`);
```

#### `exit()`

Terminates the current process with the given exit code. Wraps
`Deno.exit` / `process.exit`. Returns `never` — execution does not
continue past the call. Throws an `Error` on unknown runtimes (no
exit primitive available).

```typescript ignore
function exit(code?: number): never;
```

> ⚠ Pending I/O is discarded. Prefer letting the event loop drain
> naturally — reach for `exit` only when you need an explicit status
> code (CLI tools, soak scripts, fatal-error paths).

**Example:**

```typescript
import { exit } from '@tundralibs/compat/runtime';

declare const configMissing: boolean;

if (configMissing) {
  console.error('config not found');
  exit(1);
}
exit(0);
```

#### `unrefTimer()`

`unref` a timer handle so it does not, on its own, keep the process
alive. Node and Bun return a timer object with `.unref()`; Deno returns
a numeric id unref'd via `Deno.unrefTimer`; on browsers and Cloudflare
Workers it is a safe no-op. Pass the return of `setTimeout` /
`setInterval` straight through.

```typescript ignore
function unrefTimer(handle: unknown): void;
```

**Example:**

```typescript
import { unrefTimer } from '@tundralibs/compat/runtime';

const timer = setInterval(() => {}, 60_000);
unrefTimer(timer); // a background tick that won't hold the process open
```

### Environment Access

#### `getEnv()`

Gets environment variables as an object.

```typescript ignore
function getEnv(): Record<string, string>;
```

**Runtime Sources:**

- **Deno**: `Deno.env.toObject()` (cached after first call)
- **Bun**: `Bun.env` (live reference)
- **Node.js**: `process.env` (live reference)

**Example:**

```typescript
import { getEnv } from '@tundralibs/compat/runtime';

const env = getEnv();
console.log(env.HOME);
console.log(env.PATH);
console.log(env.NODE_ENV);
```

### Working Directory

#### `cwd()`

Gets the current working directory.

```typescript ignore
function cwd(): string;
```

**Example:**

```typescript
import { cwd } from '@tundralibs/compat/runtime';

const currentDir = cwd();
console.log(`Working directory: ${currentDir}`);
```

### Hostname

#### `hostname()`

Gets the machine's hostname. This function is exported from the `net` module.

```typescript ignore
function hostname(): string;
```

**Example:**

```typescript
import { hostname } from '@tundralibs/compat/net';

const host = hostname();
console.log(`Machine hostname: ${host}`);
```

### Process Event Handlers

The Runtime module provides unified event handling for process lifecycle and error events across Deno, Bun, and Node.js.

#### `onExit()`

Registers a handler to be called when the process exits.

```typescript ignore
function onExit(handler: () => void): () => void;
```

**Returns:** A cleanup function that removes the listener

**Runtime Implementation:**

- **Deno**: `addEventListener('unload', handler)`
- **Bun**: `process.on('exit', handler)`
- **Node.js**: `process.on('exit', handler)`

**Important Notes:**

- In Node.js/Bun, exit handlers must be synchronous
- In Deno, unload handlers can be async but should complete quickly
- Always call the cleanup function to prevent memory leaks

**Example:**

```typescript
import { onExit } from '@tundralibs/compat/runtime';

const cleanup = onExit(() => {
  console.log('Process exiting, cleaning up...');
  // Perform cleanup tasks
});

// Later, to remove the listener:
cleanup();
```

**Example - Class with cleanup:**

```typescript
import { onExit } from '@tundralibs/compat/runtime';

class DatabaseConnection {
  private exitCleanup?: () => void;

  constructor() {
    this.exitCleanup = onExit(() => {
      this.close();
    });
  }

  close() {
    console.log('Closing database connection');
    // Close connection
  }

  dispose() {
    // Remove exit listener when disposing manually
    this.exitCleanup?.();
    this.close();
  }
}
```

#### `onError()`

Registers a handler to be called when an uncaught error occurs.

```typescript ignore
function onError(handler: (error: Error) => void): () => void;
```

**Returns:** A cleanup function that removes the listener

**Runtime Implementation:**

- **Deno**: `addEventListener('error', handler)`
- **Bun**: `process.on('uncaughtException', handler)`
- **Node.js**: `process.on('uncaughtException', handler)`

**Important Notes:**

- After an uncaught error, the process state may be inconsistent
- Best practice is to log the error and exit gracefully
- Handler should not throw errors

**Example:**

```typescript
import { onError } from '@tundralibs/compat/runtime';

const cleanup = onError((error) => {
  console.error('Uncaught error:', error);
  // Log to monitoring service
  // Perform graceful shutdown
});
```

#### `onUnhandledRejection()`

Registers a handler to be called when an unhandled promise rejection occurs.

```typescript ignore
function onUnhandledRejection(handler: (reason: unknown) => void): () => void;
```

**Returns:** A cleanup function that removes the listener

**Runtime Implementation:**

- **Deno**: `addEventListener('unhandledrejection', handler)`
- **Bun**: `process.on('unhandledRejection', handler)`
- **Node.js**: `process.on('unhandledRejection', handler)`

**Important Notes:**

- Always handle promise rejections properly in production code
- This is a safety net, not a replacement for proper error handling
- Handler receives the rejection reason (often an Error object)

**Example:**

```typescript
import { onUnhandledRejection } from '@tundralibs/compat/runtime';

const cleanup = onUnhandledRejection((reason) => {
  console.error('Unhandled promise rejection:', reason);
  // Log to monitoring service
});
```

#### `onSignal()`

Registers a handler to be called when the process receives an OS signal.

```typescript ignore
function onSignal(signal: Signal, handler: () => void): () => void;

type Signal = 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'SIGBREAK';
```

**Returns:** A cleanup function that removes the listener

**Supported Signals:**

- `SIGINT` - Interrupt (Ctrl+C)
- `SIGTERM` - Termination request
- `SIGHUP` - Hangup (terminal closed)
- `SIGBREAK` - Break (Windows Ctrl+Break)

**Runtime Implementation:**

- **Deno**: `Deno.addSignalListener(signal, handler)`
- **Bun**: `process.on(signal, handler)`
- **Node.js**: `process.on(signal, handler)`

**Platform Support:**

- **Windows**: Only `SIGINT` and `SIGBREAK` are reliable
- **Unix/Linux/macOS**: All signals supported

**Example - Graceful shutdown:**

```typescript
import { exit, onSignal } from '@tundralibs/compat/runtime';

const cleanup = onSignal('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  // Close database connections
  // Save state
  // Exit cleanly
  exit(0);
});
```

**Example - Multiple signals:**

```typescript
import { onSignal } from '@tundralibs/compat/runtime';

function gracefulShutdown() {
  console.log('Shutting down...');
  // Perform cleanup
}

const cleanup1 = onSignal('SIGINT', gracefulShutdown);
const cleanup2 = onSignal('SIGTERM', gracefulShutdown);

// Clean up both listeners later
function dispose() {
  cleanup1();
  cleanup2();
}
```

### System Resources

Cross-runtime helpers for reading system-level information. All four
of these are backed by `node:os`, which Deno also exposes through its
Node compat layer — so the implementation is a single code path.

#### `cpus()`

Logical CPU count. Prefers `os.availableParallelism()` (Node 19+,
respects cgroup quotas under Docker/K8s) and falls back to
`os.cpus().length`. Always ≥ 1.

```typescript ignore
function cpus(): number;
```

**Example:**

```typescript
import { cpus } from '@tundralibs/compat/runtime';

declare function createPool(options: { size: number }): unknown;

const pool = createPool({ size: cpus() });
```

#### `totalmem()` / `freemem()`

Total / free system memory in bytes.

```typescript ignore
function totalmem(): number;
function freemem(): number;
```

> Note: "free" semantics differ across operating systems. On Linux
> this excludes cached pages that the kernel can reclaim, so the
> value tends to look smaller than expected. Treat it as a hint, not
> a budget.

**Example:**

```typescript
import { freemem, totalmem } from '@tundralibs/compat/runtime';

const totalGiB = (totalmem() / 1024 ** 3).toFixed(1);
const freeGiB = (freemem() / 1024 ** 3).toFixed(1);
console.log(`mem: ${freeGiB} / ${totalGiB} GiB free`);
```

#### `uptime()`

Host machine uptime in seconds. (For _process_ uptime use
`performance.now() / 1000`.)

```typescript ignore
function uptime(): number;
```

#### `memoryUsage()`

Current process memory snapshot. Wraps `Deno.memoryUsage()` /
`process.memoryUsage()` with a normalized shape.

```typescript ignore
type MemoryUsage = {
  rss: number; // resident set size
  heapTotal: number; // V8 heap committed
  heapUsed: number; // V8 heap in use
  external: number; // C++ objects bound to JS
  arrayBuffers: number; // ArrayBuffer-backed memory (0 on Deno)
};

function memoryUsage(): MemoryUsage;
```

> Deno's `Deno.memoryUsage()` does not expose an `arrayBuffers`
> field; the normalized output reports `0` for it on Deno.

**Example:**

```typescript
import { memoryUsage } from '@tundralibs/compat/runtime';

setInterval(() => {
  const m = memoryUsage();
  console.log(
    `heap: ${(m.heapUsed / 1024 ** 2).toFixed(1)} MiB / ` +
      `${(m.heapTotal / 1024 ** 2).toFixed(1)} MiB, ` +
      `rss: ${(m.rss / 1024 ** 2).toFixed(1)} MiB`,
  );
}, 30_000);
```

## Examples

### Runtime-Specific Code

```typescript
import { isBun, isDeno, isNode } from '@tundralibs/compat/runtime';

// `Bun` is typed by `@types/bun` in Bun projects.
declare const Bun: { file(path: string): { text(): Promise<string> } };

async function readFile(path: string): Promise<string> {
  if (isDeno) {
    return await Deno.readTextFile(path);
  }

  if (isBun) {
    const file = Bun.file(path);
    return await file.text();
  }

  if (isNode) {
    const fs = await import('node:fs/promises');
    return await fs.readFile(path, 'utf-8');
  }

  throw new Error('Unsupported runtime');
}
```

### Server Implementation Selection

```typescript
import { RUNTIME } from '@tundralibs/compat/runtime';

// `Bun` is typed by `@types/bun` in Bun projects.
declare const Bun: {
  serve(options: { port: number; fetch: (req: Request) => Response }): unknown;
};

async function createServer(port: number) {
  switch (RUNTIME) {
    case 'DENO':
      return Deno.serve({ port }, (req) => {
        return new Response('Hello from Deno!');
      });

    case 'BUN':
      return Bun.serve({
        port,
        fetch: (req) => new Response('Hello from Bun!'),
      });

    case 'NODE':
      const http = await import('node:http');
      const server = http.createServer((req, res) => {
        res.end('Hello from Node.js!');
      });
      server.listen(port);
      return server;

    default:
      throw new Error('Unsupported runtime');
  }
}
```

### Platform-Specific Paths

```typescript
import { getEnv, OS } from '@tundralibs/compat/runtime';
import { join } from '@tundralibs/compat/path';

function getConfigPath(): string {
  const env = getEnv();

  switch (OS) {
    case 'WINDOWS':
      return join(env.APPDATA as string, 'MyApp', 'config.json');

    case 'DARWIN':
      return join(
        env.HOME as string,
        'Library',
        'Application Support',
        'MyApp',
        'config.json',
      );

    case 'LINUX':
      return join(
        env.HOME as string,
        '.config',
        'myapp',
        'config.json',
      );

    default:
      return './config.json';
  }
}
```

### Environment Configuration

```typescript
import { cwd, getEnv } from '@tundralibs/compat/runtime';
import { join } from '@tundralibs/compat/path';

interface AppConfig {
  port: number;
  host: string;
  debug: boolean;
  dataDir: string;
}

function loadConfig(): AppConfig {
  const env = getEnv();

  return {
    port: parseInt(env.PORT as string || '3000'),
    host: env.HOST as string || 'localhost',
    debug: env.DEBUG === 'true',
    dataDir: env.DATA_DIR as string || join(cwd(), 'data'),
  };
}
```

### Logging with Runtime Info

```typescript
import { OS, PID, RUNTIME } from '@tundralibs/compat/runtime';
import { hostname } from '@tundralibs/compat/net';

async function logSystemInfo() {
  const host = hostname();

  console.log('System Information:');
  console.log(`  Runtime: ${RUNTIME}`);
  console.log(`  OS: ${OS}`);
  console.log(`  Hostname: ${host}`);
  console.log(`  Process ID: ${PID}`);
}

// Usage
await logSystemInfo();
// System Information:
//   Runtime: DENO
//   OS: DARWIN
//   Hostname: macbook-pro.local
//   Process ID: 12345
```

### Feature Detection

```typescript
import { isBun, isDeno, isNode } from '@tundralibs/compat/runtime';

interface RuntimeCapabilities {
  hasNativeTypescript: boolean;
  hasBunAPIs: boolean;
  hasDenoAPIs: boolean;
  hasNodeAPIs: boolean;
  fastStartup: boolean;
}

function detectCapabilities(): RuntimeCapabilities {
  return {
    hasNativeTypescript: isDeno || isBun,
    hasBunAPIs: isBun,
    hasDenoAPIs: isDeno,
    hasNodeAPIs: isNode || isBun,
    fastStartup: isBun || isDeno,
  };
}
```

### Conditional Imports

```typescript
import { isNode } from '@tundralibs/compat/runtime';

// Dynamic imports based on runtime
async function getFileSystem() {
  if (isNode) {
    // Use Node.js built-in fs
    return await import('node:fs/promises');
  } else {
    // Use polyfill or alternative
    return await import('./fs-polyfill.ts');
  }
}
```

### Cross-Runtime Testing

```typescript
import { describe, it } from '@tundralibs/compat/test';
import { cwd, getEnv, isDeno, PID, RUNTIME } from '@tundralibs/compat/runtime';
import { hostname } from '@tundralibs/compat/net';

// Bring your own assertions (e.g. `@std/assert` on Deno).
declare function assert(expr: unknown, msg?: string): asserts expr;
declare function assertMatch(actual: string, expected: RegExp): void;

describe(`Runtime: ${RUNTIME}`, () => {
  it('should detect correct runtime', () => {
    assertMatch(RUNTIME, /^(DENO|BUN|NODE)$/);
  });

  it('should have process ID', () => {
    assert(PID !== undefined && PID > 0);
  });

  it('should have working directory', () => {
    const dir = cwd();
    assert(dir.length > 0);
  });

  it('should access environment', () => {
    const env = getEnv();
    assert(env !== undefined);
  });

  it({
    name: 'should get hostname',
    // Only test in Deno
    ignore: !isDeno,
    fn() {
      const host = hostname();
      assert(host.length > 0);
    },
  });
});
```

### OS-Specific Behavior

```typescript
import { getEnv, OS } from '@tundralibs/compat/runtime';

function getLineEnding(): string {
  return OS === 'WINDOWS' ? '\r\n' : '\n';
}

function getPathSeparator(): string {
  return OS === 'WINDOWS' ? ';' : ':';
}

function getTempDir(): string {
  const env = getEnv();

  if (OS === 'WINDOWS') {
    return env.TEMP as string || env.TMP as string || 'C:\\temp';
  } else {
    return env.TMPDIR as string || '/tmp';
  }
}
```

## Best Practices

1. **Use constants over functions** - `isDeno` is faster than `getRuntime() === 'DENO'`
2. **Cache environment** - `getEnv()` caches in Deno, so call once and store
3. **Handle UNKNOWN** - Always have fallback for `RUNTIME === 'UNKNOWN'`
4. **Test all runtimes** - Verify behavior in Deno, Bun, and Node.js
5. **Prefer feature detection** - When possible, detect features not runtimes

**Example:**

```typescript
import { getRuntime, isDeno } from '@tundralibs/compat/runtime';

// ✅ Good - Direct constant check
if (isDeno) {
  // Deno code
}

// ❌ Less efficient - Function call
if (getRuntime() === 'DENO') {
  // Deno code
}

// ✅ Good - Feature detection
if (typeof Deno !== 'undefined' && 'permissions' in Deno) {
  // Use Deno permissions API
}
```

---

[← Back to Compat](../README.md)

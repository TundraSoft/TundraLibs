# Compat-Common

Shared types and error classes used across the Compat package.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Compat-Common](#compat-common)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Installation](#installation)
    - [Import](#import)
  - [Types](#types)
    - [TLSOptions](#tlsoptions)
    - [ValidatedTLS](#validatedtls)
  - [Base Error Classes](#base-error-classes)
    - [CompatError](#compaterror)
    - [CompatTypeError](#compattypeerror)
    - [UnsupportedRuntimeError](#unsupportedruntimeerror)
    - [ConnectionTimeoutError](#connectiontimeouterror)
  - [TLS Error Classes](#tls-error-classes)
    - [FetchTLSError](#fetchtlserror)
    - [FetchFileNotFoundError](#fetchfilenotfounderror)
    - [FetchInvalidPEMError](#fetchinvalidpemerror)
    - [FetchPathTraversalError](#fetchpathtraversalerror)
  - [Functions](#functions)
    - [validateTLS()](#validatetls)
    - [validateTLSContent()](#validatetlscontent)
    - [validateTLSFiles()](#validatetlsfiles)
    - [validateUnixSocket()](#validateunixsocket)
    - [combineSignals()](#combinesignals)
  - [Security](#security)
    - [Path Traversal Protection](#path-traversal-protection)
    - [PEM Size Limits](#pem-size-limits)
    - [Best Practices](#best-practices)
  - [Related Documentation](#related-documentation)

## Overview

The Common module contains two layers: the **base error hierarchy** (`CompatError` and friends) that every module in the package throws, and the **TLS configuration types, TLS-specific errors, and validation utilities** used by the [Fetch](Compat-Fetch.md), [Net](Compat-Net.md), and [WebServer](../webserver/Compat-WebServer.md) modules. Import error classes and `TLSOptions` directly from this module when you need to type-check thrown errors or annotate TLS configuration in your own code.

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
import {
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
  FetchTLSError,
  type TLSOptions,
} from '@tundralibs/compat';
```

**Direct import (Deno):**

```typescript
import { FetchTLSError, type TLSOptions } from 'jsr:@tundralibs/compat';
```

## Types

### TLSOptions

TLS configuration for client connections and listeners. All fields are optional — supply only what your use case needs.

```typescript
type TLSOptions = {
  /** PEM-encoded certificate string (mTLS). */
  cert?: string;
  /** PEM-encoded private key string (mTLS). */
  key?: string;
  /** Array of PEM-encoded CA certificate strings. */
  ca?: string[];
  /** Path to PEM-encoded certificate file (mTLS). */
  certFile?: string;
  /** Path to PEM-encoded private key file (mTLS). */
  keyFile?: string;
  /** Path to PEM-encoded CA certificates file. */
  caFile?: string;
  /**
   * Whether to reject connections with untrusted server certificates.
   * Defaults to `true`. Set `false` only in development.
   * Note: not supported on Deno.
   */
  rejectUnauthorized?: boolean;
};
```

**Common Patterns:**

| Use Case                             | Fields to Supply                           |
| ------------------------------------ | ------------------------------------------ |
| System trust roots (default TLS)     | No fields — just `tls: true`               |
| Custom CA, no client cert            | `ca` / `caFile` only                       |
| Mutual TLS (mTLS) with files         | `certFile` + `keyFile` + optional `caFile` |
| Mutual TLS (mTLS) with strings       | `cert` + `key` + optional `ca`             |
| Disable cert verification (dev only) | `rejectUnauthorized: false`                |

> **Important:** `cert` and `key` (or `certFile` and `keyFile`) must always be provided together — one without the other will throw `FetchInvalidPEMError`.

> **Deno limitation:** `rejectUnauthorized: false` is not supported on Deno. Use the `--unsafely-ignore-certificate-errors=hostname` CLI flag instead, or supply the server's CA certificate via `ca`/`caFile`.

**Example — Server-only TLS (verify server's certificate):**

```typescript
import { connect } from '@tundralibs/compat/net';

// System trust roots
const conn = await connect({
  hostname: 'api.example.com',
  port: 443,
  tls: true,
});
conn.close();
```

**Example — Custom CA:**

```typescript
import { connect } from '@tundralibs/compat/net';
import { readTextFileSync } from '@tundralibs/compat/file';

const corporateCaPem = readTextFileSync('/etc/ssl/corp-ca.pem');

const conn = await connect({
  hostname: 'internal.corp',
  port: 443,
  tls: { ca: [corporateCaPem] },
});
conn.close();
```

**Example — Mutual TLS (mTLS):**

```typescript
import { connect } from '@tundralibs/compat/net';

const conn = await connect({
  hostname: 'secure.api.com',
  port: 443,
  tls: {
    certFile: '/etc/ssl/client.crt',
    keyFile: '/etc/ssl/client.key',
    caFile: '/etc/ssl/ca.crt',
  },
});
conn.close();
```

### ValidatedTLS

The resolved TLS configuration returned by `validateTLSContent()` and `validateTLSFiles()`. All fields contain PEM strings (not file paths).

```typescript
type ValidatedTLS = {
  /** PEM-encoded certificate (mTLS only). */
  cert?: string;
  /** PEM-encoded private key (mTLS only). */
  key?: string;
  /** Array of PEM-encoded CA certificates. */
  ca?: string[];
  /** Whether to reject untrusted server certificates. */
  rejectUnauthorized?: boolean;
};
```

## Base Error Classes

Every error `@tundralibs/compat` throws — in this module and every other one (`file`, `net`, `webserver`, `watch`, `udp`, …) — extends `CompatError` or its `TypeError`-flavoured sibling `CompatTypeError`. Catch `CompatError` for one branch that handles _any_ compat failure; catch a specific subclass when you need to react differently to different failures (retry a timeout, log a path-traversal attempt as a security event, feature-detect around an unsupported runtime, …).

### CompatError

Base class for nearly every error the package throws (import validation, network, filesystem, server lifecycle, …). Captures `runtime` and `os` at construction time and exposes a `toJSON()` for structured logging.

```typescript ignore
class CompatError extends Error {
  readonly runtime: Runtime; // 'DENO' | 'BUN' | 'NODE' | 'WORKERS' | 'BROWSER' | 'UNKNOWN'
  readonly os: OperatingSystem; // 'WINDOWS' | 'LINUX' | 'DARWIN' | 'UNKNOWN'
  toJSON(): Record<string, unknown>;
}
```

**Example — catch-all handling:**

```typescript
import { CompatError } from '@tundralibs/compat';
import { readTextFile } from '@tundralibs/compat/file';

try {
  await readTextFile('./config.json');
} catch (error) {
  if (error instanceof CompatError) {
    // Every compat-thrown error lands here, whatever the concrete
    // subclass — FileOperationError, UnsupportedRuntimeError, etc.
    console.error(
      `[${error.runtime}/${error.os}] ${error.name}: ${error.message}`,
    );
  } else {
    throw error; // not a compat error — rethrow
  }
}
```

> A `CompatError` catch is a fallback net, not a substitute for branching on a specific subclass when the response needs to differ per failure — see [Compat-File](Compat-File.md) and [Compat-Net](Compat-Net.md) for the module-specific subclasses.

### CompatTypeError

Same fields and `toJSON()` as `CompatError`, extending `TypeError` instead of `Error` for failures that are type-shape problems (a caller passed something a runtime check rejected) rather than operational ones. Branch on it with `instanceof CompatTypeError`.

```typescript ignore
class CompatTypeError extends TypeError {
  readonly runtime: Runtime;
  readonly os: OperatingSystem;
  toJSON(): Record<string, unknown>;
}
```

### UnsupportedRuntimeError

Thrown whenever the current runtime cannot service a call — a Deno-only feature invoked from Node, or, most commonly across this package, a capability Cloudflare Workers or the browser genuinely lack (`webserver`'s `start()`, `watch()`, a UNIX-socket `connect()`, `udpSocket()`, …). This is the error every "degrades gracefully" runtime gap documented across the package resolves to, instead of a raw `TypeError` on a missing built-in.

```typescript ignore
class UnsupportedRuntimeError extends CompatError {
  readonly operation: string; // the call that couldn't be serviced
  readonly detectedRuntime: Runtime; // runtime that lacked the feature
}

new UnsupportedRuntimeError(
  operation: string,
  detectedRuntime?: Runtime, // defaults to the runtime detected at import time
  additionalDetails?: string,
  cause?: Error,
)
```

**Example:**

```typescript
import { UnsupportedRuntimeError } from '@tundralibs/compat';
import { listen } from '@tundralibs/compat/net';

try {
  const listener = await listen({ port: 8080 });
  listener.close();
} catch (error) {
  if (error instanceof UnsupportedRuntimeError) {
    // e.g. on Cloudflare Workers: workerd has no way to accept an
    // inbound connection, so `listen()` always throws here.
    console.error(`${error.operation} unsupported on ${error.detectedRuntime}`);
  }
}
```

> Prefer feature-detecting with `isWorkers` / `isBrowser` / `RUNTIME` from [Compat-Runtime](Compat-Runtime.md) _before_ the call, and skip the code path entirely — catching `UnsupportedRuntimeError` is for call sites that only conditionally need the capability.

### ConnectionTimeoutError

Thrown by `net`'s `connect()` when a TCP/TLS/UNIX-socket connection doesn't complete within the configured `timeout`. Carries either `hostname`/`port` (TCP/TLS) or `path` (UNIX), plus the `timeoutMs` that elapsed.

```typescript ignore
class ConnectionTimeoutError extends CompatError {
  readonly hostname?: string;
  readonly port?: number;
  readonly path?: string;
  readonly timeoutMs?: number;
}
```

**Example:**

```typescript
import { ConnectionTimeoutError } from '@tundralibs/compat';
import { connect } from '@tundralibs/compat/net';

try {
  await connect({ hostname: 'unreachable.example', port: 443, timeout: 2000 });
} catch (error) {
  if (error instanceof ConnectionTimeoutError) {
    console.error(
      `Timed out after ${error.timeoutMs}ms connecting to ${error.hostname}:${error.port}`,
    );
  }
}
```

See [Compat-Net](Compat-Net.md) for the full `connect()` / `listen()` reference.

## TLS Error Classes

All TLS error classes extend `CompatError` which captures the current `runtime` and `os` at the time the error is thrown.

### FetchTLSError

Base error for TLS configuration issues. Extended by `FetchInvalidPEMError`.

```typescript ignore
class FetchTLSError extends CompatError {
  /** Which TLS component caused the error: 'cert', 'key', 'ca[0]', etc. */
  readonly source: string;
}
```

**Constructor:**

```typescript ignore
new FetchTLSError(message: string, source: string, cause?: Error)
```

**Example:**

```typescript
import { FetchTLSError } from '@tundralibs/compat';
import { connect } from '@tundralibs/compat/net';
import { readTextFileSync } from '@tundralibs/compat/file';

const badCert = 'not-a-pem';
const validKey = readTextFileSync('/etc/ssl/client.key');

try {
  await connect({
    hostname: 'example.com',
    port: 443,
    tls: { cert: badCert, key: validKey },
  });
} catch (error) {
  if (error instanceof FetchTLSError) {
    console.error(`TLS error in ${error.source}: ${error.message}`);
    // e.g. "TLS error in cert: Invalid PEM format for certificate."
  }
}
```

### FetchFileNotFoundError

Thrown when a required file (certificate, key, CA, or Unix socket) does not exist.

```typescript ignore
class FetchFileNotFoundError extends CompatError {
  /** The path to the missing file. */
  readonly path: string;
}
```

**Constructor:**

```typescript ignore
new FetchFileNotFoundError(path: string, cause?: Error)
```

**Example:**

```typescript
import { FetchFileNotFoundError } from '@tundralibs/compat';
import { connect } from '@tundralibs/compat/net';

try {
  await connect({
    hostname: 'example.com',
    port: 443,
    tls: { certFile: '/missing/cert.pem', keyFile: '/missing/key.pem' },
  });
} catch (error) {
  if (error instanceof FetchFileNotFoundError) {
    console.error(`Missing file: ${error.path}`);
  }
}
```

### FetchInvalidPEMError

Thrown when PEM format validation fails. Extends `FetchTLSError`.

PEM files must follow this structure:

```
-----BEGIN CERTIFICATE-----
base64-encoded-content
-----END CERTIFICATE-----
```

Supported types: `CERTIFICATE`, `PRIVATE KEY`, `RSA PRIVATE KEY`, `EC PRIVATE KEY`.

```typescript ignore
class FetchInvalidPEMError extends FetchTLSError {
  /** Which TLS component has invalid PEM: 'cert', 'key', 'ca[0]', etc. */
  readonly source: string;
}
```

**Constructor:**

```typescript ignore
new FetchInvalidPEMError(message: string, source: string, cause?: Error)
```

**Size limit:** PEM content is capped at 1 MB before regex validation to prevent ReDoS attacks.

**Example:**

```typescript
import { FetchInvalidPEMError } from '@tundralibs/compat';
import { connect } from '@tundralibs/compat/net';
import { readTextFileSync } from '@tundralibs/compat/file';

const validKey = readTextFileSync('/etc/ssl/client.key');

try {
  await connect({
    hostname: 'example.com',
    port: 443,
    tls: { cert: 'not-pem', key: validKey },
  });
} catch (error) {
  if (error instanceof FetchInvalidPEMError) {
    console.error(`Invalid PEM in ${error.source}: ${error.message}`);
  }
}
```

### FetchPathTraversalError

Thrown when a file path contains directory traversal sequences (`../`, `..\`) or null bytes — a security violation.

```typescript ignore
class FetchPathTraversalError extends CompatError {
  /** The path that triggered the traversal detection. */
  readonly path: string;
  /** Always 'path_traversal'. */
  readonly reason: 'path_traversal';
}
```

**Constructor:**

```typescript ignore
new FetchPathTraversalError(path: string, cause?: Error)
```

**Detected patterns:**

- `../` or `..\` anywhere in the path
- Null byte (`\0`) anywhere in the path

**Example:**

```typescript
import { FetchPathTraversalError } from '@tundralibs/compat';
import { connect } from '@tundralibs/compat/net';

try {
  await connect({
    hostname: 'example.com',
    port: 443,
    tls: { certFile: '../../../etc/passwd', keyFile: 'key.pem' },
  });
} catch (error) {
  if (error instanceof FetchPathTraversalError) {
    // Log as security event
    console.error(`SECURITY: Path traversal attempt: ${error.path}`);
  }
}
```

## Functions

### validateTLS()

Resolves a whole {@link TLSOptions}-shaped value (the `tls` field you pass to `connect()`, `fetch()`, or `WebServer`'s TLS options) to validated PEM content. This is what `net`, `fetch`, and `webserver` call internally, and the function to reach for whenever you're holding a `TLSOptions` object and don't already know — or don't want to branch on — whether it's inline PEM or file paths. Use `validateTLSContent()` / `validateTLSFiles()` directly only when you already have the individual `cert`/`key`/`ca` (or `certFile`/`keyFile`/`caFile`) fields in hand.

```typescript ignore
function validateTLS(tls: InlineTLS & FileTLS): ValidatedTLS;
```

**Parameters:**

- `tls` - Inline PEM fields (`cert`/`key`/`ca`) or file-path fields (`certFile`/`keyFile`/`caFile`) — never both.

**Returns:** `ValidatedTLS` object with validated PEM content (file paths are read and resolved to strings).

**Throws:**

- `FetchTLSError` - If `tls` mixes inline material with file paths (e.g. `cert` alongside `keyFile`).
- `FetchInvalidPEMError` - If any PEM is malformed, the wrong type, or `cert`/`key` (`certFile`/`keyFile`) are provided without each other.
- `FetchFileNotFoundError` / `FetchPathTraversalError` - For the file-path style, on a missing or unsafe path.

**Example:**

```typescript
import { FetchTLSError, validateTLS } from '@tundralibs/compat';

const ok = validateTLS({
  ca: ['-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'],
});
// ok.ca is now validated PEM content

try {
  // Mixing inline material with file paths is rejected — pick one style.
  validateTLS({ cert: '...', keyFile: '/etc/ssl/client.key' });
} catch (error) {
  if (error instanceof FetchTLSError) {
    console.error(`Invalid TLS config in ${error.source}: ${error.message}`);
  }
}
```

> `validateTLS`'s parameter type (`InlineTLS & FileTLS`) is more permissive than the exported {@link TLSOptions} type, which rejects a mixed object at compile time. Passing an `InlineTLS & FileTLS` value straight through — bypassing a `TLSOptions`-typed call site — moves that guard to runtime, where it throws `FetchTLSError` instead.

### validateTLSContent()

> **Internal:** Marked `@internal` in source and used by `validateTLS()` and `WebServer` internally. Prefer `validateTLS()` when you're holding a `TLSOptions`-shaped value; reach for this directly only when you already have separate `cert`/`key`/`ca` fields.

Validates PEM content for certificate, key, and optional CA certificates. Synchronous.

```typescript ignore
function validateTLSContent(
  cert?: string,
  key?: string,
  ca?: string[],
): ValidatedTLS;
```

**Parameters:**

- `cert` - Optional PEM certificate string. Required together with `key` for mTLS.
- `key` - Optional PEM private key string. Required together with `cert` for mTLS.
- `ca` - Optional array of PEM CA certificate strings.

**Returns:** `ValidatedTLS` object with validated string content.

**Throws:**

- `FetchInvalidPEMError` - If any PEM is malformed, the wrong type, or `cert`/`key` are provided without each other.

**Example:**

```typescript
import { validateTLSContent } from '@tundralibs/compat';
import { readTextFileSync } from '@tundralibs/compat/file';

const certPem = readTextFileSync('/etc/ssl/client.crt');
const keyPem = readTextFileSync('/etc/ssl/client.key');
const caPem = readTextFileSync('/etc/ssl/ca.crt');

const tls = validateTLSContent(certPem, keyPem, [caPem]);
// tls.cert, tls.key, tls.ca are now validated
```

### validateTLSFiles()

> **Internal:** Marked `@internal` in source and used by `validateTLS()` internally. Prefer `validateTLS()` when you're holding a `TLSOptions`-shaped value; reach for this directly only when you already have separate `certFile`/`keyFile`/`caFile` fields.

Reads TLS files from disk and validates their PEM content. Synchronous.

```typescript ignore
function validateTLSFiles(
  certFile?: string,
  keyFile?: string,
  caFile?: string,
): ValidatedTLS;
```

**Parameters:**

- `certFile` - Optional path to PEM certificate file. Required together with `keyFile` for mTLS.
- `keyFile` - Optional path to PEM private key file. Required together with `certFile` for mTLS.
- `caFile` - Optional path to PEM CA certificate file.

**Returns:** `ValidatedTLS` object with the file contents as validated strings.

**Throws:**

- `FetchPathTraversalError` - If any path contains traversal sequences or null bytes.
- `FetchFileNotFoundError` - If any file does not exist.
- `FetchInvalidPEMError` - If any file's PEM content is malformed.

**Example:**

```typescript
import { validateTLSFiles } from '@tundralibs/compat';

const tls = validateTLSFiles(
  '/etc/ssl/client.crt',
  '/etc/ssl/client.key',
  '/etc/ssl/ca.crt',
);
// tls.cert, tls.key, tls.ca are now validated PEM strings
```

### validateUnixSocket()

> **Internal:** This function is marked `@internal` and is used by `fetch()` and `connect()` internally. It is not part of the public API and should not be called directly.

Validates a Unix socket path for security and existence. Asynchronous.

```typescript ignore
async function validateUnixSocket(socketPath: string): Promise<void>;
```

**Parameters:**

- `socketPath` - Path to the Unix socket file.

**Throws:**

- `FetchPathTraversalError` - If the path contains traversal sequences.
- `FetchFileNotFoundError` - If the socket file does not exist.

**Example:**

```typescript
import { validateUnixSocket } from '@tundralibs/compat/common';

await validateUnixSocket('/var/run/docker.sock');
// Socket path is valid and exists
```

### combineSignals()

Combines a timeout duration and an optional `AbortSignal` into a single `AbortSignal` that triggers when either condition fires first.

```typescript ignore
function combineSignals(
  timeout?: number,
  signal?: AbortSignal,
): AbortSignal | undefined;
```

**Parameters:**

- `timeout` - Timeout in milliseconds. `undefined` means no timeout.
- `signal` - Optional `AbortSignal` for manual cancellation.

**Returns:** A combined `AbortSignal`, or `undefined` if neither parameter is provided.

**Behavior:**

| `timeout`   | `signal`    | Returns                                           |
| ----------- | ----------- | ------------------------------------------------- |
| `undefined` | `undefined` | `undefined`                                       |
| `undefined` | provided    | the same `signal`                                 |
| provided    | `undefined` | `AbortSignal.timeout(timeout)`                    |
| provided    | provided    | combined signal (aborts on whichever fires first) |

Uses `AbortSignal.any()` when available (Node.js 20+, Deno 1.41+, Bun 1.1+), with a manual fallback for older runtimes.

**Example:**

```typescript
import { combineSignals } from '@tundralibs/compat';

const controller = new AbortController();

// Aborts after 5 seconds OR when controller.abort() is called
const signal = combineSignals(5000, controller.signal);

if (signal) {
  fetch('https://api.example.com/data', { signal });
}
```

## Security

### Path Traversal Protection

`validateTLSFiles()` and `validateUnixSocket()` reject any path containing:

- `../` or `..\` directory traversal sequences
- Null bytes (`\0`) — used in path injection attacks

Always treat `FetchPathTraversalError` as a security event and log it accordingly.

### PEM Size Limits

All PEM content is checked against a 1 MB size limit before regex validation to prevent Regular Expression Denial of Service (ReDoS) attacks.

### Best Practices

1. **Log path traversal errors as security events** — They indicate an attack or misconfiguration.
2. **Never set `rejectUnauthorized: false` in production** — Use a proper CA certificate instead.
3. **Use file-based TLS in production** — Avoid embedding certificate strings in source code.
4. **Restrict certificate file permissions** — `chmod 600` on private key files.
5. **Rotate credentials regularly** — Use file-based TLS to update without code changes.

## Related Documentation

- [Compat-Fetch](Compat-Fetch.md) - HTTP client with TLS and Unix socket support
- [Compat-Net](Compat-Net.md) - TCP/TLS networking with `upgradeTls`, plus `ConnectionTimeoutError` in context
- [Compat-WebServer](../webserver/Compat-WebServer.md) - HTTPS/WSS server TLS configuration
- [Compat-Runtime](Compat-Runtime.md) - Runtime detection utilities; `isWorkers` / `isBrowser` for feature-detecting around `UnsupportedRuntimeError`

---

[← Back to Compat](../README.md)

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
  - [Error Classes](#error-classes)
    - [FetchTLSError](#fetchtlserror)
    - [FetchFileNotFoundError](#fetchfilenotfounderror)
    - [FetchInvalidPEMError](#fetchinvalidpemerror)
    - [FetchPathTraversalError](#fetchpathtraversalerror)
  - [Functions](#functions)
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

The Common module contains the shared TLS configuration types, error classes, and validation utilities used by both the [Fetch](Compat-Fetch.md) and [Net](Compat-Net.md) modules. Import error classes and `TLSOptions` directly from this module when you need to type-check thrown errors or annotate TLS configuration in your own code.

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

## Error Classes

All error classes extend `CompatError` which captures the current `runtime` and `os` at the time the error is thrown.

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

### validateTLSContent()

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
- [Compat-Net](Compat-Net.md) - TCP/TLS networking with `upgradeTls`
- [Compat-Runtime](Compat-Runtime.md) - Runtime detection utilities

---

[← Back to Compat](../README.md)

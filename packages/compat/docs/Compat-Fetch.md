# Fetch Utilities

Cross-runtime HTTP fetch with TLS client authentication and Unix socket support.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [TLS Client Authentication](#tls-client-authentication)
- [Unix Socket Connections](#unix-socket-connections)
- [API Reference](#api-reference)
- [Error Handling](#error-handling)
- [Security](#security)
- [Related Documentation](#related-documentation)

## Features

| Feature                   | Deno | Bun | Node.js |
| ------------------------- | ---- | --- | ------- |
| Basic fetch               | ✅   | ✅  | ✅      |
| TLS client authentication | ✅   | ✅  | ❌*     |
| Unix domain sockets       | ✅   | ✅  | ❌*     |
| File-based TLS config     | ✅   | ✅  | ❌*     |
| String-based TLS config   | ✅   | ✅  | ❌*     |
| Path traversal protection | ✅   | ✅  | N/A     |
| PEM validation            | ✅   | ✅  | N/A     |

*Node.js requires the `undici` library for TLS client auth and Unix sockets.

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

**Direct import (Deno):**

```typescript
import { fetch } from 'jsr:@tundralibs/compat/fetch';
```

## Quick Start

```typescript
import { fetch } from '@tundralibs/compat/fetch';

// Basic request (works like standard fetch)
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// With TLS client certificate
const secureResponse = await fetch('https://secure.api.com/data', {
  tls: {
    certFile: '/path/to/client.crt',
    keyFile: '/path/to/client.key',
  },
});

// Via Unix socket
const dockerResponse = await fetch('http://localhost/containers/json', {
  unix: '/var/run/docker.sock',
});
```

## TLS Client Authentication

TLS client authentication (mTLS) allows your application to authenticate itself to a server using certificates.

### File-Based Configuration

Recommended for production environments where certificates are stored on disk:

```typescript
import { FetchFileNotFoundError, FetchTLSError } from '@tundralibs/compat';
import { fetch } from '@tundralibs/compat/fetch';

const response = await fetch('https://secure.api.com/data', {
  tls: {
    certFile: '/etc/ssl/client.crt', // Path to certificate
    keyFile: '/etc/ssl/client.key', // Path to private key
    caFile: '/etc/ssl/ca.crt', // Optional: Custom CA
  },
});
```

### String-Based Configuration

For embedded credentials or when loading from environment variables:

```typescript
import { fetch } from '@tundralibs/compat/fetch';

const response = await fetch('https://secure.api.com/data', {
  tls: {
    cert: process.env.CLIENT_CERT!, // PEM certificate string
    key: process.env.CLIENT_KEY!, // PEM private key string
    ca: [process.env.CA_CERT!], // Optional: CA certificates array
  },
});
```

### PEM Format Requirements

All certificates and keys must be in PEM format:

```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUANBgkqhkiG9w0Bahq...
-----END CERTIFICATE-----
```

Common key types:

- `PRIVATE KEY` (PKCS#8)
- `RSA PRIVATE KEY` (PKCS#1)
- `EC PRIVATE KEY` (Elliptic curve)

> **Note:** Unlike `cert`/`ca` (checked against the `CERTIFICATE` label),
> `key`'s PEM label isn't verified — validation only confirms balanced
> `-----BEGIN X-----`/`-----END X-----` markers, not that `X` says
> `PRIVATE KEY`. A mislabeled or wrong-type block still passes this
> layer; the runtime's TLS stack is what rejects a genuinely invalid key
> at connect time.

### Encrypted Private Keys

Passphrase-protected (encrypted) private keys are not supported on any
runtime — `TLSOptions` has no passphrase field. Decrypt the key before use:

```bash
# Works for PKCS#8, RSA, and EC keys
openssl pkey -in encrypted.key -out decrypted.key
```

> ⚠️ **Security Note**: Store decrypted keys with restrictive permissions
> (`chmod 600`) and never commit them to version control.

## Unix Socket Connections

Connect to services via Unix domain sockets instead of TCP:

```typescript
import { fetch } from '@tundralibs/compat/fetch';

// Docker API
const containers = await fetch('http://localhost/containers/json', {
  unix: '/var/run/docker.sock',
});

// Local service
const health = await fetch('http://localhost/health', {
  unix: '/var/run/myapp.sock',
});
```

### Combined with TLS

```typescript
import { fetch } from '@tundralibs/compat/fetch';

// Secure Unix socket connection
const response = await fetch('https://localhost/api', {
  unix: '/var/run/secure.sock',
  tls: {
    certFile: '/etc/ssl/client.crt',
    keyFile: '/etc/ssl/client.key',
  },
});
```

## API Reference

### fetch()

Enhanced fetch with TLS and Unix socket support.

```typescript ignore
fetch(
  input: RequestInfo | URL,
  init?: RequestInit & {
    unix?: string;
    tls?: TLSOptions;
  }
): Promise<Response>
```

**Parameters:**

- `input` - URL string, URL object, or Request object
- `init` - Standard fetch options plus:
  - `unix` - Path to Unix domain socket
  - `tls` - TLS configuration object

**Returns:** Promise resolving to Response

**Throws:**

- `FetchPathTraversalError` - If file paths contain `../` or null bytes
- `FetchFileNotFoundError` - If TLS files or socket don't exist
- `FetchInvalidPEMError` - If certificates are not valid PEM format
- `FetchTLSError` - If `tls` mixes the inline (`cert`/`key`/`ca`) and
  file-path (`certFile`/`keyFile`/`caFile`) styles
- `UnsupportedRuntimeError` - If TLS/Unix used on Node.js
- `Error` (plain, not a `CompatError` subclass) - On Deno, when
  `tls.rejectUnauthorized` is `false` — Deno has no in-process way to
  disable certificate verification. Run Deno with
  `--unsafely-ignore-certificate-errors`, or pass the server's CA via
  `tls.ca`/`tls.caFile` instead.

### TLSOptions

See [Compat-Common → TLSOptions](Compat-Common.md#tlsoptions) for the full type definition.

The inline PEM form (`cert`/`key`/`ca`) and the file-path form
(`certFile`/`keyFile`/`caFile`) are mutually exclusive — supply one style,
not both. `validateTLS` throws if they are mixed:

```typescript ignore
import type { TLSOptions } from '@tundralibs/compat';

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
   * Whether to reject untrusted server certificates.
   * Defaults to `true`. Bun honors `false`; Deno rejects it (see below).
   */
  rejectUnauthorized?: boolean;
};
```

> **Note:** `cert`/`key` and `certFile`/`keyFile` must always be supplied together. Providing one without the other throws `FetchInvalidPEMError`.

> **Deno + `rejectUnauthorized: false`:** Deno has no in-process way to
> bypass certificate verification, so `fetch(url, { tls: { rejectUnauthorized: false } })`
> throws a **plain `Error`** on Deno — not `FetchTLSError` or any other
> `CompatError` subclass, so an `instanceof FetchTLSError` branch in a
> catch block won't see it. Bun honors the flag natively. On Deno, either
> run with `--unsafely-ignore-certificate-errors`, or supply the server's
> CA via `tls.ca` / `tls.caFile` instead of disabling verification.

### Error Classes

All error classes are defined in the [Compat-Common](Compat-Common.md#error-classes) module and exported from `@tundralibs/compat/common` and the package root `@tundralibs/compat`.

#### FetchTLSError

Base error for TLS configuration issues.

```typescript ignore
class FetchTLSError extends CompatError {
  source: string; // Which TLS component caused the error
}
```

#### FetchFileNotFoundError

Thrown when a required file doesn't exist.

```typescript ignore
class FetchFileNotFoundError extends CompatError {
  path: string; // The missing file path
}
```

#### FetchInvalidPEMError

Thrown when PEM format validation fails.

```typescript ignore
class FetchInvalidPEMError extends FetchTLSError {
  source: string; // e.g., 'cert', 'key', 'ca[0]'
}
```

#### FetchPathTraversalError

Thrown when path traversal attack is detected.

```typescript ignore
class FetchPathTraversalError extends CompatError {
  path: string; // The suspicious path
  reason: string; // Always 'path_traversal'
}
```

## Error Handling

```typescript
import {
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
  FetchTLSError,
} from '@tundralibs/compat';
import { fetch } from '@tundralibs/compat/fetch';

try {
  const response = await fetch('https://secure.api.com/data', {
    tls: {
      certFile: '/etc/ssl/client.crt',
      keyFile: '/etc/ssl/client.key',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(data);
} catch (error) {
  if (error instanceof FetchPathTraversalError) {
    // Security violation - log and reject
    console.error(`Security: Path traversal in ${error.path}`);
  } else if (error instanceof FetchFileNotFoundError) {
    // Missing certificate file
    console.error(`Config: Missing file ${error.path}`);
  } else if (error instanceof FetchInvalidPEMError) {
    // Invalid certificate format
    console.error(`Config: Invalid PEM in ${error.source}`);
  } else if (error instanceof FetchTLSError) {
    // Other TLS configuration error
    console.error(`TLS: ${error.message}`);
  } else if (error instanceof TypeError) {
    // Network error (standard fetch behavior)
    console.error(`Network: ${error.message}`);
  } else {
    throw error;
  }
}
```

## Security

### Path Traversal Protection

All file paths are validated against directory traversal attacks:

```typescript
import { fetch } from '@tundralibs/compat/fetch';

const url = 'https://secure.api.com/data';

// These will throw FetchPathTraversalError
await fetch(url, {
  tls: { certFile: '../../../etc/passwd', keyFile: 'key.pem' },
});
await fetch(url, { tls: { certFile: '/path/with\0null', keyFile: 'key.pem' } });
await fetch(url, { unix: '../../var/run/docker.sock' });
```

Blocked patterns:

- `../` sequences (forward or back slash)
- Null bytes (`\0`)

### PEM Size Limits

To prevent Regular Expression Denial of Service (ReDoS) attacks, PEM content is limited to 1MB before regex validation.

### Best Practices

1. **Use file-based TLS in production** - Avoid embedding certificates in code
2. **Restrict certificate file permissions** - Use `chmod 600` on key files
3. **Use environment variables** - For string-based credentials in CI/CD
4. **Validate server certificates** - Use custom CA when connecting to internal services
5. **Monitor for errors** - Log `FetchPathTraversalError` as security events

## Related Documentation

- [Compat-Common](Compat-Common.md) - TLSOptions type, TLS error classes, and validation utilities
- [Compat-Net](Compat-Net.md) - TCP/TLS networking utilities
- [Compat-Runtime](Compat-Runtime.md) - Runtime detection utilities
- [Compat-File](Compat-File.md) - File system operations
- [Compat-Path](Compat-Path.md) - Path manipulation

---

[← Back to Compat](../README.md)

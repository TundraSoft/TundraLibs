# Compat-Net

Cross-runtime networking utilities with a unified API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
  - [Types](#types)
  - [Functions](#functions)
    - [listen()](#listen)
    - [connect()](#connect)
    - [upgradeTls()](#upgradetls)
    - [hostname()](#hostname)
- [Examples](#examples)
- [Error Handling](#error-handling)

## Overview

The Net module provides a unified interface for networking operations across Deno, Bun, and Node.js runtimes, including TCP listeners, connections, and hostname resolution.

### Key Features

- **Cross-runtime compatibility** - Works seamlessly across Deno, Bun, and Node.js
- **TCP listeners** - Create TCP servers on specified ports
- **TCP connections** - Connect to remote hosts via TCP
- **Hostname resolution** - Get the system hostname
- **Type-safe** - Full TypeScript support with detailed type definitions

### Features

| Feature                     | Bun | Deno | Node.js |
| --------------------------- | --- | ---- | ------- |
| TCP listener                | ✅  | ✅   | ✅      |
| TLS listener                | ✅  | ✅   | ✅      |
| Unix socket listen          | ✅  | ✅   | ✅      |
| Accept connections          | ✅  | ✅   | ✅      |
| TCP connection              | ✅  | ✅   | ✅      |
| TLS connection              | ✅  | ✅   | ✅      |
| Unix socket connect         | ✅  | ✅   | ✅      |
| Connection timeout          | ✅  | ✅   | ✅      |
| Abort signal support        | ✅  | ✅   | ✅      |
| Upgrade TCP→TLS (STARTTLS)  | ✅  | ✅   | ✅      |
| `rejectUnauthorized: false` | ✅  | ❌*  | ✅      |
| Hostname resolution         | ✅  | ✅   | ✅      |
| Read from socket            | ✅  | ✅   | ✅      |
| Write to socket             | ✅  | ✅   | ✅      |
| Address info                | ✅  | ✅   | ✅      |

*Deno requires the `--unsafely-ignore-certificate-errors=hostname` CLI flag instead.

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
import { connect, hostname, listen } from '@tundralibs/compat/net';
```

**Direct import (Deno):**

```typescript
import { connect, hostname, listen } from 'jsr:@tundralibs/compat/net';
```

## API Reference

### Types

#### `ListenOptions`

Options for creating a TCP, TLS, or Unix socket listener.

```typescript ignore
type ListenOptions =
  | {
    /** The port number to listen on */
    port: number;
    /** The hostname to bind to (default: "0.0.0.0") */
    hostname?: string;
    /** TLS configuration for secure connections */
    tls?: boolean | TLSOptions;
    /** AbortSignal to close the listener automatically */
    signal?: AbortSignal;
  }
  | {
    /** The Unix socket path to listen on */
    path: string;
    /** AbortSignal to close the listener automatically */
    signal?: AbortSignal;
  };
```

**TCP/TLS Properties:**

- `port` - The port number to listen on (required)
- `hostname` - The hostname to bind to (optional, defaults to `"0.0.0.0"`)
- `tls` - TLS configuration (optional). Use `true` for TLS without client cert validation, or provide `TLSOptions` for full TLS configuration
- `signal` - AbortSignal to automatically close the listener when aborted (optional)

**Unix Socket Properties:**

- `path` - The Unix socket path to listen on (required)
- `signal` - AbortSignal to automatically close the listener when aborted (optional)

#### `ConnectOptions`

Options for creating a TCP, TLS, or Unix socket connection.

```typescript ignore
type ConnectOptions =
  | {
    /** The port number to connect to */
    port: number;
    /** The hostname to connect to (default: "127.0.0.1") */
    hostname?: string;
    /** TLS configuration for secure connections */
    tls?: boolean | TLSOptions;
    /** Connection timeout in milliseconds */
    timeout?: number;
    /** AbortSignal to cancel the connection attempt */
    signal?: AbortSignal;
  }
  | {
    /** The Unix socket path to connect to */
    path: string;
    /** Connection timeout in milliseconds */
    timeout?: number;
    /** AbortSignal to cancel the connection attempt */
    signal?: AbortSignal;
  };
```

**TCP/TLS Connection Properties:**

- `port` - The port number to connect to (required)
- `hostname` - The hostname to connect to (optional, defaults to `"127.0.0.1"`)
- `tls` - TLS configuration (optional). Use `true` for system trust roots with no client cert, or a [`TLSOptions`](Compat-Common.md#tlsoptions) object for custom CA or mTLS.
- `timeout` - Connection timeout in milliseconds (optional)
- `signal` - AbortSignal for manual cancellation (optional)

**Unix Socket Properties:**

- `path` - The Unix socket path to connect to (not supported on Windows)
- `timeout` - Connection timeout in milliseconds (optional)
- `signal` - AbortSignal for manual cancellation (optional)

**Note:** When both `timeout` and `signal` are provided, the connection aborts when either triggers first.

### Interfaces

#### `Listener`

A cross-runtime listener type for TCP, TLS, or Unix sockets.

```typescript ignore
type Listener = {
  /** Accepts an incoming connection */
  accept(): Promise<Connection>;

  /** Closes the listener and releases the port/socket */
  close(): void;
};
```

**Methods:**

- `accept()` - Waits for and accepts an incoming connection. Returns a `Promise` that resolves with a `Connection` object. This can be called repeatedly to accept multiple connections.
- `close()` - Closes the listener and releases the port or Unix socket. Safe to call multiple times.

#### `Connection`

A cross-runtime TCP connection type providing read/write capabilities.

```typescript
type Connection = {
  /** Reads data from the connection */
  read(): Promise<Uint8Array | null>;

  /** Writes data to the connection */
  write(data: Uint8Array | string): Promise<number>;

  /** Closes the connection */
  close(): void;

  /** The remote address information */
  readonly remoteAddr?: {
    hostname: string;
    port: number;
  };

  /** The local address information */
  readonly localAddr?: {
    hostname: string;
    port: number;
  };
};
```

**Methods:**

- `read()` - Reads data from the connection. Returns binary data as a `Uint8Array`, or `null` if the connection has been closed (EOF). TCP does not preserve message boundaries, so data may be partial, complete, or multiple messages.
- `write(data)` - Writes data to the connection. Accepts either a `Uint8Array` or a `string`. Returns the number of bytes written.
- `close()` - Closes the connection. Safe to call multiple times.

**Properties:**

- `remoteAddr` - Information about the remote endpoint (hostname and port)
- `localAddr` - Information about the local endpoint (hostname and port)
- `_raw` - The underlying runtime-specific socket handle. Used internally by `upgradeTls()` to perform in-place TLS negotiation (e.g. Postgres `SSLRequest`, SMTP `STARTTLS`). Treat as opaque — do not call methods on this object directly.

#### `UpgradeTlsOptions`

Options for upgrading a plain TCP connection to TLS.

```typescript ignore
type UpgradeTlsOptions = {
  /** Hostname for SAN/SNI certificate verification (required). */
  hostname: string;
  /**
   * TLS configuration. Same shape as ConnectOptions.tls.
   * Use `true` for system trust roots, or TLSOptions for custom CA / mTLS.
   */
  tls?: boolean | TLSOptions;
};
```

### Functions

#### `listen()`

Creates a TCP, TLS, or Unix socket listener.

```typescript ignore
async function listen(options: ListenOptions): Promise<Listener>;
```

**Parameters:**

- `options` - Listener configuration options
  - For TCP/TLS: `{ port, hostname?, tls? }`
  - For Unix socket: `{ path }`

**Returns:** A promise resolving to a `Listener` object with `accept()` and `close()` methods

**Throws:**

- `Error` - If the port is already in use or if binding fails
- `FetchPathTraversalError` - If TLS file paths contain traversal sequences
- `FetchFileNotFoundError` - If TLS certificate/key files don't exist
- `FetchInvalidPEMError` - If TLS certificates are not valid PEM format
- `UnsupportedRuntimeError` - If called in an unsupported runtime

**Runtime Implementation:**

- **Deno**: Uses `Deno.listen()` for TCP/Unix, `Deno.listenTls()` for TLS
- **Bun**: Uses Node.js-compatible `net.createServer()` for TCP/Unix, `tls.createServer()` for TLS
- **Node.js**: Uses `net.createServer()` for TCP/Unix, `tls.createServer()` for TLS

**Example - Basic TCP server:**

```typescript
import { listen } from '@tundralibs/compat/net';

const listener = await listen({ port: 8080 });
console.log('Server listening on port 8080');

// Accept and handle connections
while (true) {
  const conn = await listener.accept();
  // Handle connection...
  const data = await conn.read();
  if (data) {
    await conn.write('Hello from server!\n');
  }
  conn.close();
}
```

**Example - TLS server with file-based certificates:**

```typescript
import { listen } from '@tundralibs/compat/net';

const listener = await listen({
  port: 8443,
  hostname: '0.0.0.0',
  tls: {
    certFile: '/path/to/server.crt',
    keyFile: '/path/to/server.key',
    caFile: '/path/to/ca.crt', // optional
  },
});

const conn = await listener.accept();
console.log('Secure connection accepted');
conn.close();
listener.close();
```

**Example - TLS server with string-based certificates:**

```typescript
import { listen } from '@tundralibs/compat/net';

const listener = await listen({
  port: 8443,
  tls: {
    cert: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
    key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
  },
});

const conn = await listener.accept();
conn.close();
listener.close();
```

**Example - Unix socket server:**

```typescript
import { listen } from '@tundralibs/compat/net';

const listener = await listen({ path: '/tmp/myapp.sock' });
console.log('Server listening on Unix socket');

const conn = await listener.accept();
const data = await conn.read();
if (data) {
  console.log('Received:', new TextDecoder().decode(data));
}
conn.close();
listener.close();
```

**Example - Listener with graceful shutdown:**

```typescript
import { listen } from '@tundralibs/compat/net';

const controller = new AbortController();

const listener = await listen({
  port: 8080,
  signal: controller.signal,
});

console.log('Server listening on port 8080');

// Later, for graceful shutdown
controller.abort(); // Automatically closes the listener
console.log('Server shut down gracefully');
```

**Example - Testing port availability:**

```typescript
import { listen } from '@tundralibs/compat/net';

async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const listener = await listen({ port });
    listener.close();
    return true;
  } catch {
    return false;
  }
}

if (await isPortAvailable(8080)) {
  console.log('Port 8080 is available');
} else {
  console.log('Port 8080 is already in use');
}
```

#### `connect()`

Creates a TCP or Unix socket connection to the specified destination.

```typescript ignore
async function connect(options: ConnectOptions): Promise<Connection>;
```

**Parameters:**

- `options` - Connection configuration options
  - **For TCP**: `{ port, hostname? }`
  - **For Unix socket**: `{ path }`

**Returns:** A promise that resolves to a `Connection` object

**Throws:**

- `Error` - If the connection fails
- `ConnectionTimeoutError` - If the connection times out (when `timeout` is specified)
- `FetchPathTraversalError` - If TLS file paths contain traversal sequences
- `FetchFileNotFoundError` - If TLS certificate/key files don't exist
- `FetchInvalidPEMError` - If TLS certificates are not valid PEM format

**Runtime Implementation:**

- **Deno**: Uses `Deno.connect()` for TCP/Unix, `Deno.connectTls()` for TLS
- **Bun**: Uses `net.createConnection()` for TCP/Unix, `tls.connect()` for TLS
- **Node.js**: Uses `net.createConnection()` for TCP/Unix, `tls.connect()` for TLS

**Example - TCP connection:**

```typescript
import { connect } from '@tundralibs/compat/net';

const conn = await connect({ hostname: 'example.com', port: 80 });

// Send HTTP request
await conn.write('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');

// Read response
const data = await conn.read();

if (data) {
  const response = new TextDecoder().decode(data);
  console.log(response);
}

conn.close();
```

**Example - TCP connection with timeout:**

```typescript
import { connect } from '@tundralibs/compat/net';
import { ConnectionTimeoutError } from '@tundralibs/compat';

try {
  const conn = await connect({
    hostname: 'example.com',
    port: 80,
    timeout: 5000, // 5 second timeout
  });

  await conn.write('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
  const data = await conn.read();
  conn.close();
} catch (err) {
  if (err instanceof ConnectionTimeoutError) {
    console.error('Connection timed out after 5 seconds');
  } else {
    console.error('Connection failed:', err);
  }
}
```

**Example - Abort connection manually:**

```typescript
import { connect } from '@tundralibs/compat/net';
import { ConnectionTimeoutError } from '@tundralibs/compat';

const controller = new AbortController();

// Cancel connection after 3 seconds
setTimeout(() => controller.abort(), 3000);

try {
  const conn = await connect({
    hostname: 'example.com',
    port: 80,
    signal: controller.signal,
  });
  conn.close();
} catch (err) {
  if (err instanceof ConnectionTimeoutError) {
    console.error('Connection was cancelled');
  }
}
```

**Example - Combine timeout and signal:**

```typescript
import { connect } from '@tundralibs/compat/net';
import { ConnectionTimeoutError } from '@tundralibs/compat';

const controller = new AbortController();

// Whichever happens first will abort the connection
try {
  const conn = await connect({
    hostname: 'example.com',
    port: 80,
    timeout: 10000, // 10 second timeout
    signal: controller.signal, // OR manual abort
  });

  // Use connection...
  conn.close();
} catch (err) {
  if (err instanceof ConnectionTimeoutError) {
    console.error('Connection aborted (timeout or signal)');
  }
}

// Later, can manually abort if needed
controller.abort();
```

**Example - TLS connection (file-based):**

```typescript
import { connect } from '@tundralibs/compat/net';

// Secure connection with client certificates
const conn = await connect({
  hostname: 'secure.example.com',
  port: 443,
  tls: {
    certFile: '/path/to/client.crt',
    keyFile: '/path/to/client.key',
    caFile: '/path/to/ca.crt', // optional
  },
});

await conn.write('GET /api/data HTTP/1.1\r\nHost: secure.example.com\r\n\r\n');
const data = await conn.read();
conn.close();
```

**Example - TLS connection (string-based):**

```typescript
import { connect } from '@tundralibs/compat/net';

// Using certificate content directly
const conn = await connect({
  hostname: 'api.example.com',
  port: 8443,
  tls: {
    cert: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
    key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
  },
});

conn.close();
```

**Example - Unix socket connection:**

```typescript
import { connect } from '@tundralibs/compat/net';

// Connect to a Unix domain socket
const conn = await connect({ path: '/tmp/app.sock' });

await conn.write('Hello via Unix socket\n');
const data = await conn.read();

if (data) {
  const response = new TextDecoder().decode(data);
  console.log('Response:', response);
}

conn.close();
```

**Example - Connect to localhost:**

```typescript
import { connect } from '@tundralibs/compat/net';

// Connects to localhost:8080
const conn = await connect({ port: 8080 });

await conn.write('Hello, server!\n');
conn.close();
```

**Example - Echo client:**

```typescript
import { connect } from '@tundralibs/compat/net';

async function echoClient(message: string) {
  const conn = await connect({ hostname: 'localhost', port: 8080 });

  // Write message
  await conn.write(message);

  // Read echo
  const echo = await conn.read();

  if (echo !== null) {
    const decoder = new TextDecoder();
    const response = decoder.decode(echo);
    console.log('Server echoed:', response);
  }

  conn.close();
}

await echoClient('Hello, World!');
```

**Example - Check connection info:**

```typescript
import { connect } from '@tundralibs/compat/net';

const conn = await connect({ hostname: 'example.com', port: 80 });

console.log('Connected to:', conn.remoteAddr);
// Output: Connected to: { hostname: 'example.com', port: 80 }

console.log('Local address:', conn.localAddr);
// Output: Local address: { hostname: '192.168.1.100', port: 54321 }

conn.close();
```

#### `upgradeTls()`

Upgrades a plain TCP `Connection` to TLS in place. Used by protocols that negotiate TLS _after_ an initial plaintext exchange — for example:

- **PostgreSQL**: client sends `SSLRequest`, server replies `'S'`, then TLS is negotiated on the same socket.
- **SMTP**: client sends `STARTTLS`, server replies `220`, then TLS is negotiated.

The original `Connection` should be considered consumed after a successful upgrade — do not call `read`/`write` on it. Use the returned connection instead.

```typescript ignore
async function upgradeTls(
  conn: Connection,
  options: UpgradeTlsOptions,
): Promise<Connection>;
```

**Parameters:**

- `conn` - The plain TCP connection to upgrade. Must have been created by `connect()` (not user-constructed), as it requires the `_raw` socket handle.
- `options.hostname` - Hostname for SNI and server certificate SAN verification (required).
- `options.tls` - TLS configuration (optional). Same as `ConnectOptions.tls`.

**Returns:** A new TLS-wrapped `Connection`.

**Throws:**

- `Error` - If `conn._raw` is missing (connection was not created by `connect()`).
- `Error` - On Deno, if `rejectUnauthorized: false` is requested (not supported — use `--unsafely-ignore-certificate-errors` instead).
- `FetchPathTraversalError` - If TLS file paths contain traversal sequences.
- `FetchFileNotFoundError` - If TLS certificate/key files don't exist.
- `FetchInvalidPEMError` - If TLS certificates are not valid PEM format.

**Runtime Implementation:**

- **Deno**: Uses `Deno.startTls()`
- **Bun / Node.js**: Uses `tls.connect({ socket: rawSocket, ... })`

**Example — PostgreSQL-style STARTTLS:**

```typescript
import { connect, upgradeTls } from '@tundralibs/compat/net';

// 1. Open plain TCP connection
const conn = await connect({ hostname: 'db.example.com', port: 5432 });

// 2. Send SSLRequest (PostgreSQL protocol)
const sslRequest = new Uint8Array([0, 0, 0, 8, 4, 210, 22, 47]);
await conn.write(sslRequest);

// 3. Read server response
const response = await conn.read();
if (!response || String.fromCharCode(response[0]) !== 'S') {
  throw new Error('Server does not support SSL');
}

// 4. Upgrade to TLS (conn is consumed, use tlsConn from here on)
const tlsConn = await upgradeTls(conn, {
  hostname: 'db.example.com',
  tls: { caFile: '/etc/ssl/postgresql-ca.crt' },
});

// 5. Continue with TLS-encrypted communication
await tlsConn.write(new Uint8Array([/* startup message */]));
const data = await tlsConn.read();

tlsConn.close();
```

**Example — SMTP STARTTLS:**

```typescript
import { connect, upgradeTls } from '@tundralibs/compat/net';

const conn = await connect({ hostname: 'mail.example.com', port: 587 });

// Read SMTP greeting
await conn.read();

// Send EHLO
await conn.write('EHLO client.example.com\r\n');
await conn.read();

// Start TLS negotiation
await conn.write('STARTTLS\r\n');
const reply = await conn.read();

if (reply && new TextDecoder().decode(reply).startsWith('220')) {
  // Server is ready for TLS — upgrade the connection
  const tlsConn = await upgradeTls(conn, {
    hostname: 'mail.example.com',
    tls: true, // use system trust roots
  });

  // Continue SMTP over TLS
  await tlsConn.write('EHLO client.example.com\r\n');
  tlsConn.close();
}
```

**Example — mTLS upgrade:**

```typescript
import { type Connection, upgradeTls } from '@tundralibs/compat/net';

declare const conn: Connection;

const tlsConn = await upgradeTls(conn, {
  hostname: 'secure.internal.corp',
  tls: {
    certFile: '/etc/ssl/client.crt',
    keyFile: '/etc/ssl/client.key',
    caFile: '/etc/ssl/corp-ca.crt',
  },
});
```

#### `hostname()`

Gets the hostname of the current machine.

```typescript ignore
function hostname(): string;
```

**Returns:** The hostname of the machine

**Runtime Implementation:**

- **Deno**: Uses `Deno.hostname()`
- **Bun**: Uses Node.js-compatible `os.hostname()`
- **Node.js**: Uses native `os.hostname()`
- **Unknown runtime**: Returns `'localhost'` as fallback

**Example - Basic usage:**

```typescript
import { hostname } from '@tundralibs/compat/net';

const host = hostname();
console.log(`Machine hostname: ${host}`);
// Output: Machine hostname: my-computer
```

**Example - Server logging:**

```typescript
import { hostname, listen } from '@tundralibs/compat/net';

async function startServer(port: number) {
  const host = hostname();
  const listener = await listen({ port });

  console.log(`Server running on ${host}:${port}`);

  return listener;
}

const listener = await startServer(8080);
```

## Examples

### Port Availability Checker

```typescript
import { listen } from '@tundralibs/compat/net';

async function findAvailablePort(
  startPort: number,
  endPort: number,
): Promise<number | null> {
  for (let port = startPort; port <= endPort; port++) {
    try {
      const listener = await listen({ port });
      listener.close();
      return port;
    } catch {
      // Port is in use, try next
    }
  }
  return null;
}

const port = await findAvailablePort(8000, 8100);
if (port) {
  console.log(`Found available port: ${port}`);
} else {
  console.log('No available ports in range');
}
```

### Simple Echo Server

```typescript
import { connect, hostname, listen } from '@tundralibs/compat/net';

async function startEchoServer(port: number) {
  const listener = await listen({ port });
  const host = hostname();

  console.log(`Echo server listening on ${host}:${port}`);

  return listener;
}

// Start server
const server = await startEchoServer(8080);

// Later, close the server
server.close();
```

### TCP Health Check

```typescript
import { connect } from '@tundralibs/compat/net';
import { ConnectionTimeoutError } from '@tundralibs/compat';

async function checkTcpHealth(
  hostname: string,
  port: number,
  timeout = 5000,
): Promise<boolean> {
  try {
    const conn = await connect({ hostname, port, timeout });
    conn.close();
    return true;
  } catch (err) {
    if (err instanceof ConnectionTimeoutError) {
      console.log(`Connection to ${hostname}:${port} timed out`);
    }
    return false;
  }
}

const isHealthy = await checkTcpHealth('example.com', 80);
console.log(`Server is ${isHealthy ? 'healthy' : 'down'}`);
```

### HTTP GET Request

```typescript
import { connect } from '@tundralibs/compat/net';

async function httpGet(hostname: string, path: string): Promise<string> {
  const conn = await connect({ hostname, port: 80 });

  // Send HTTP request
  const request =
    `GET ${path} HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`;
  await conn.write(request);

  // Read response
  const chunks: Uint8Array[] = [];

  while (true) {
    const chunk = await conn.read();
    if (chunk === null) break;
    chunks.push(chunk);
  }

  conn.close();

  // Combine chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const decoder = new TextDecoder();
  return decoder.decode(combined);
}

const response = await httpGet('example.com', '/');
console.log(response);
```

### Port Scanner

```typescript
import { connect } from '@tundralibs/compat/net';
import { ConnectionTimeoutError } from '@tundralibs/compat';

async function isPortOpen(
  hostname: string,
  port: number,
  timeout = 1000,
): Promise<boolean> {
  try {
    const conn = await connect({ hostname, port, timeout });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

async function scanPorts(hostname: string, ports: number[]): Promise<number[]> {
  const results = await Promise.all(
    ports.map(async (port) => ({
      port,
      open: await isPortOpen(hostname, port),
    })),
  );

  return results.filter((r) => r.open).map((r) => r.port);
}

const openPorts = await scanPorts('localhost', [80, 443, 3000, 8080]);
console.log('Open ports:', openPorts);
```

### Connection with Retry Logic

```typescript
import { connect, type Connection } from '@tundralibs/compat/net';
import { ConnectionTimeoutError } from '@tundralibs/compat';

async function connectWithRetry(
  hostname: string,
  port: number,
  maxRetries = 3,
  timeout = 5000,
): Promise<Connection> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connection attempt ${attempt}/${maxRetries}`);
      const conn = await connect({ hostname, port, timeout });
      console.log('Connected successfully');
      return conn;
    } catch (err) {
      if (err instanceof ConnectionTimeoutError) {
        console.log(`Attempt ${attempt} timed out`);
      } else {
        console.log(`Attempt ${attempt} failed:`, (err as Error).message);
      }

      // Wait before retrying
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw new Error(`Failed to connect after ${maxRetries} attempts`);
}

const conn = await connectWithRetry('example.com', 80);
conn.close();
```

### Graceful Server Shutdown

```typescript
import { listen, type Listener } from '@tundralibs/compat/net';

class Server {
  private controller: AbortController;
  private listener: Listener;

  private constructor(listener: Listener, controller: AbortController) {
    this.listener = listener;
    this.controller = controller;
  }

  static async create(port: number) {
    const controller = new AbortController();
    const listener = await listen({
      port,
      signal: controller.signal,
    });
    console.log(`Server started on port ${port}`);
    return new Server(listener, controller);
  }

  async run() {
    try {
      while (true) {
        const conn = await this.listener.accept();
        // Handle each connection without blocking the accept loop
        void this.handleConnection(conn);
      }
    } catch {
      // Listener was closed (signal aborted) — exit the loop cleanly
      console.log('Server stopped');
    }
  }

  private async handleConnection(
    conn: Awaited<ReturnType<Listener['accept']>>,
  ) {
    try {
      const data = await conn.read();
      if (data) await conn.write(data);
    } finally {
      conn.close();
    }
  }

  shutdown() {
    console.log('Shutting down server...');
    this.controller.abort(); // Automatically closes listener
  }
}

const server = await Server.create(8080);

// Run server in background
server.run();

// Shutdown after 10 seconds
setTimeout(() => server.shutdown(), 10000);
```

### Connection Timeout Error

```typescript
import { connect } from '@tundralibs/compat/net';
import { ConnectionTimeoutError } from '@tundralibs/compat';

try {
  const conn = await connect({
    hostname: 'slow-server.example.com',
    port: 80,
    timeout: 3000, // 3 second timeout
  });
  conn.close();
} catch (error) {
  if (error instanceof ConnectionTimeoutError) {
    console.error('Connection timed out after', error.timeoutMs, 'ms');
    console.error('Target:', error.hostname, error.port);
  } else if (error instanceof Error) {
    console.error('Connection failed:', error.message);
  }
}
```

### Multi-Runtime Server Info

```typescript
import { hostname, listen } from '@tundralibs/compat/net';
import { RUNTIME } from '@tundralibs/compat/runtime';

async function displayServerInfo(port: number) {
  const host = hostname();
  const listener = await listen({ port });

  console.log('Server Information:');
  console.log(`  Runtime: ${RUNTIME}`);
  console.log(`  Hostname: ${host}`);
  console.log(`  Port: ${port}`);
  console.log(`  Listening on: http://${host}:${port}`);

  listener.close();
}

await displayServerInfo(8080);
```

## Error Handling

The net module throws standard JavaScript errors and runtime-specific errors:

### Port Already in Use

```typescript
import { listen } from '@tundralibs/compat/net';

try {
  const listener = await listen({ port: 8080 });
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('address already in use')) {
      console.error('Port 8080 is already in use');
    } else {
      console.error('Failed to create listener:', error.message);
    }
  }
}
```

### Connection Failed

```typescript
import { connect } from '@tundralibs/compat/net';

try {
  const conn = await connect({ hostname: 'invalid-host', port: 80 });
} catch (error) {
  if (error instanceof Error) {
    console.error('Connection failed:', error.message);
    // Handle connection failure (host not found, timeout, etc.)
  }
}
```

### Unsupported Runtime

```typescript
import { listen } from '@tundralibs/compat/net';
import { UnsupportedRuntimeError } from '@tundralibs/compat';

try {
  const listener = await listen({ port: 8080 });
} catch (error) {
  if (error instanceof UnsupportedRuntimeError) {
    console.error('This runtime is not supported');
  }
}
```

### Safe Cleanup

```typescript
import { connect, listen } from '@tundralibs/compat/net';

// Listeners and connections are safe to close multiple times
const listener = await listen({ port: 8080 });
listener.close();
listener.close(); // Safe - no error thrown

const conn = await connect({ port: 8080 });
conn.close();
conn.close(); // Safe - no error thrown
```

## Related Documentation

- [Compat-Common](Compat-Common.md) - TLSOptions type and TLS error classes
- [Compat-Fetch](Compat-Fetch.md) - HTTP client with TLS and Unix socket support
- [Compat-Runtime](Compat-Runtime.md) - Runtime detection utilities

---

[← Back to Compat](../README.md)

# Error Handling

Reference for WebServer module error types and handling patterns.

## Table of Contents

- [Error Hierarchy](#error-hierarchy)
- [Error Types](#error-types)
  - [ServerError](#servererror)
  - [ServerConfigurationError](#serverconfigurationerror)
  - [ServerPermissionError](#serverpermissionerror)
  - [ServerAlreadyRunningError](#serveralreadyrunningerror)
  - [ServerNotRunningError](#servernotrunningerror)
- [Error Events](#error-events)
- [Handling Patterns](#handling-patterns)
- [Common Errors](#common-errors)

## Error Hierarchy

```
BaseError
└── ServerError
    ├── ServerConfigurationError
    ├── ServerPermissionError
    ├── ServerAlreadyRunningError
    └── ServerNotRunningError
```

All server errors extend `ServerError`, which extends the base `BaseError` class. Each error includes:

- `message` - Human-readable description
- `mode` - Server mode ('TCP' or 'UNIX') when applicable
- `operation` - What operation failed
- `cause` - Original error (if wrapping)

## Error Types

### ServerError

Base class for all server-related errors.

```typescript ignore
class ServerError extends BaseError {
  readonly mode: ServerMode;
  readonly operation: string;

  constructor(
    message: string,
    mode: ServerMode,
    operation: string,
    cause?: Error,
  );

  toJSON(): object;
}
```

**When thrown:**

- Generic server failures
- Wrapping unknown errors from runtime APIs
- Failures during start/stop operations

```typescript
import { ServerError, type WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

try {
  server.start();
} catch (error) {
  if (error instanceof ServerError) {
    console.log(`Operation failed: ${error.operation}`);
    console.log(`Mode: ${error.mode}`);
    console.log(`Message: ${error.message}`);
    if (error.cause instanceof Error) {
      console.log(`Caused by: ${error.cause.message}`);
    }
  }
}
```

### ServerConfigurationError

Thrown when server options are invalid.

```typescript ignore
class ServerConfigurationError extends ServerError {
  /** Option that failed validation (e.g. `'port'`, `'tls.certFile'`). */
  readonly option: string;
  /** The rejected value, as supplied. */
  readonly value: unknown;
  /** What a valid value looks like, when the thrower described it. */
  readonly expected?: string;

  constructor(
    mode: ServerMode | 'N/A',
    option: string,
    value: unknown,
    expected?: string,
  );
}
```

The three values are exposed as readonly properties and included in
`toJSON()`, so a caller can branch on `err.option` instead of parsing
the message.

**When thrown:**

- Invalid port number
- Missing required options
- Invalid TLS configuration
- Invalid handler function
- Invalid socket path

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

// Invalid port
new WebServer('API', {
  mode: 'TCP',
  port: 99999, // > 65535
  handler: () => new Response('OK'),
});
// Throws: ServerConfigurationError
// option: 'port'
// value: 99999
// expected: 'a valid port number (0 to 65535)'

// Missing handler
new WebServer('API', {
  mode: 'TCP',
  port: 8080,
  handler: null as any,
});
// Throws: ServerConfigurationError
// option: 'handler'
// expected: 'a function'
```

**Handling:**

```typescript
import {
  ServerConfigurationError,
  type ServerOptions,
  WebServer,
} from '@tundralibs/compat/webserver';

declare const config: ServerOptions;

try {
  const server = new WebServer('API', config);
} catch (error) {
  if (error instanceof ServerConfigurationError) {
    // The offending key, its value and the expectation are folded
    // into `message`; `operation` is always 'CONFIGURATION'.
    console.error(`Invalid config: ${error.message}`);
    console.error(`Mode: ${error.mode}, operation: ${error.operation}`);
  }
}
```

### ServerPermissionError

Thrown when the server lacks required permissions.

```typescript ignore
class ServerPermissionError extends ServerError {
  constructor(message: string, mode: ServerMode);
}
```

**When thrown:**

- Cannot read TLS certificate file
- Cannot read TLS key file
- Cannot write to UNIX socket directory

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

// Unreadable certificate
new WebServer('API', {
  mode: 'TCP',
  port: 443,
  tls: {
    certFile: '/root/secret/cert.pem', // No read permission
    keyFile: '/root/secret/key.pem',
  },
  handler: () => new Response('OK'),
});
// Throws: ServerPermissionError
// message: "Insufficient permissions to read certificate file..."
```

**Handling:**

```typescript
import {
  type ServerOptions,
  ServerPermissionError,
  WebServer,
} from '@tundralibs/compat/webserver';

declare const config: ServerOptions;

try {
  const server = new WebServer('API', config);
} catch (error) {
  if (error instanceof ServerPermissionError) {
    console.error('Permission denied:', error.message);
    console.error('Check file permissions and ownership');
  }
}
```

### ServerAlreadyRunningError

Thrown when attempting to start an already-running server.

```typescript ignore
class ServerAlreadyRunningError extends ServerError {
  constructor(mode: ServerMode, operation: string);
}
```

**When thrown:**

- Calling `start()` when state is not 'STOPPED'

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

server.start();
server.start(); // Throws ServerAlreadyRunningError
```

**Handling:**

```typescript
import {
  ServerAlreadyRunningError,
  type WebServer,
} from '@tundralibs/compat/webserver';

declare const server: WebServer;

try {
  server.start();
} catch (error) {
  if (error instanceof ServerAlreadyRunningError) {
    console.log('Server is already running');
    // Maybe that's okay, or restart:
    await server.stop();
    server.start();
  }
}
```

### ServerNotRunningError

Thrown when attempting operations on a stopped server.

```typescript ignore
class ServerNotRunningError extends ServerError {
  constructor(mode: ServerMode, operation: string);
}
```

**When thrown:**

- Calling `stop()` when not running
- Calling `ref()` when not running
- Calling `unref()` when not running

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

await server.stop();
await server.stop(); // Throws ServerNotRunningError
```

**Handling:**

```typescript
import {
  ServerNotRunningError,
  type WebServer,
} from '@tundralibs/compat/webserver';

declare const server: WebServer;

try {
  await server.stop();
} catch (error) {
  if (error instanceof ServerNotRunningError) {
    console.log('Server was not running');
  }
}
```

## Error Events

The server emits `onError` events for runtime errors:

```typescript
import { ServerError, type WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

server.on('onError', (name, error, request, info) => {
  console.error(`[${name}] Error:`, error.message);

  if (error instanceof ServerError) {
    console.error(`  Operation: ${error.operation}`);
    console.error(`  Mode: ${error.mode}`);
  }

  if (request) {
    console.error(`  Request: ${request.method} ${request.url}`);
  }

  if (info) {
    console.error(`  Request ID: ${info.requestId}`);
    console.error(`  Remote: ${info.remoteAddress}:${info.remotePort}`);
  }
});
```

**Events include optional request context when:**

- Error occurred during request handling
- Handler threw an exception

## Handling Patterns

### Graceful Degradation

```typescript
import {
  ServerConfigurationError,
  type ServerOptions,
  WebServer,
} from '@tundralibs/compat/webserver';

function createServer(config: ServerOptions): WebServer | null {
  try {
    return new WebServer('API', config);
  } catch (error) {
    if (error instanceof ServerConfigurationError) {
      console.error(`Config error: ${error.message}`);
      return null;
    }
    throw error; // Re-throw unexpected errors
  }
}
```

### Retry with Backoff

```typescript
import { ServerError, type WebServer } from '@tundralibs/compat/webserver';

async function startWithRetry(
  server: WebServer,
  maxRetries = 3,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      server.start();
      return;
    } catch (error) {
      if (error instanceof ServerError && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.log(`Start failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
}
```

### Centralized Error Logging

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const logger: { error(entry: unknown): void };

function setupErrorHandling(server: WebServer): void {
  server.on('onError', (name, error, request, info) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      server: name,
      error: error.toJSON(),
      request: request
        ? {
          method: request.method,
          url: request.url,
          headers: Object.fromEntries(request.headers),
        }
        : null,
      info: info
        ? {
          requestId: info.requestId,
          remoteAddress: info.remoteAddress,
          requestTime: info.requestTime.toISOString(),
        }
        : null,
    };

    // Log to file, send to monitoring service, etc.
    logger.error(logEntry);
  });
}
```

### Error Response Customization

```typescript
import { type RequestInfo, WebServer } from '@tundralibs/compat/webserver';

declare function handleRequest(
  req: Request,
  info: RequestInfo,
): Promise<Response>;
declare class ValidationError extends Error {
  readonly fields: string[];
}
declare class NotFoundError extends Error {}

const server = new WebServer('API', {
  mode: 'TCP',
  port: 8080,
  handler: async (req, info) => {
    try {
      return await handleRequest(req, info);
    } catch (error) {
      // Custom error responses
      if (error instanceof ValidationError) {
        return Response.json(
          { error: error.message, fields: error.fields },
          { status: 400 },
        );
      }

      if (error instanceof NotFoundError) {
        return Response.json(
          { error: 'Resource not found' },
          { status: 404 },
        );
      }

      // Let server handle unknown errors (returns 500)
      throw error;
    }
  },
});
```

## Common Errors

### Port Already in Use

**Error:** `EADDRINUSE` or similar

**Solution:**

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;
declare const port: number;

try {
  server.start();
} catch (error) {
  const cause = (error as Error).cause as { code?: string } | undefined;
  if (cause?.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
    // Try different port, or kill existing process
  }
}
```

### Socket File Exists

**Error:** UNIX socket file from previous run

The server automatically removes existing socket files, but if issues persist:

```typescript
import { removeSync } from '@tundralibs/compat/file';
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

// Manual cleanup before starting
try {
  removeSync('/var/run/myapp.sock');
} catch {}

server.start();
```

### Certificate Not Found

**Error:** `ServerConfigurationError` for TLS files

**Solution:**

```typescript
import { isFileSync } from '@tundralibs/compat/file';

declare const config: { tls: { certFile: string } };

// Validate before creating server
if (!isFileSync(config.tls.certFile)) {
  console.error(`Certificate not found: ${config.tls.certFile}`);
  process.exit(1);
}
```

### Handler Throws

**Error:** Unhandled exception in request handler

The server catches handler exceptions and returns 500, but you should handle errors:

```typescript
import type { ServerHandler } from '@tundralibs/compat/webserver';

declare function processRequest(req: Request): Promise<Response>;

const handler: ServerHandler = async (req, info) => {
  try {
    return await processRequest(req);
  } catch (error) {
    // Log the error
    console.error(`Request failed:`, error);

    // Return appropriate response
    return new Response('Something went wrong', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
};
```

### Malformed Request

**Error:** A request whose `Host` header cannot be parsed into a valid URL
(for example an out-of-range port such as `Host: example:99999999999`).

Handling differs by runtime, because each builds the `Request` differently:

- **Node** reconstructs the request URL from the client-supplied `Host` header
  before dispatch. A value that Node's HTTP parser accepts but WHATWG URL
  parsing rejects would otherwise throw and crash the process, so the server
  rejects it with **`400 Bad Request`** _before your handler runs_ (and a
  WebSocket upgrade carrying a malformed `Host` header is dropped by closing
  the socket). Your handler is **not** invoked.
- **Deno** and **Bun** build the `Request` from their native HTTP layer, so the
  request **is** dispatched to your handler, with `req.url` set to the
  unparseable string (for example `http://example:99999999999/`). The server
  does not reject it first. If your handler then calls `new URL(req.url)` — the
  idiom used throughout these docs — that call throws; the server catches it
  and answers **`500 Internal Server Error`**.

Because of this divergence, on Deno and Bun you should guard URL parsing (or
validate the `Host` header) if untrusted clients can send a malformed `Host`:

```typescript
import type { ServerHandler } from '@tundralibs/compat/webserver';

const handler: ServerHandler = (req, info) => {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  // ...use `url` safely
  return new Response('OK');
};
```

### Shutdown Timeout

**Error:** Graceful stop taking too long

**Solution:**

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

const stopTimeout = setTimeout(() => {
  console.warn('Graceful stop timeout, forcing...');
  server.stop(false).catch(console.error);
}, 30000);

await server.stop();
clearTimeout(stopTimeout);
```

---

[← Back to WebServer](../Compat-WebServer.md)

# WebServer

Cross-runtime HTTP/HTTPS server with WebSocket support for Bun, Deno, and Node.js.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [TCP Mode](#tcp-mode)
  - [UNIX Mode](#unix-mode)
  - [TLS/HTTPS](#tlshttps)
  - [WebSocket](#websocket)
- [API Reference](#api-reference)
  - [Constructor](#constructor)
  - [Properties](#properties)
  - [Methods](#methods)
- [Events](#events)
- [Metrics](#metrics)
- [Examples](#examples)
- [Runtime Compatibility](#runtime-compatibility)
- [Related Documentation](#related-documentation)

## Features

| Feature                  | Bun  | Deno | Node.js |
| ------------------------ | ---- | ---- | ------- |
| HTTP/HTTPS               | ✅   | ✅   | ✅      |
| UNIX sockets             | ✅   | ✅   | ✅      |
| WebSocket                | ✅   | ✅   | ✅\*    |
| WS upgrade hook (typed)  | ✅   | ✅   | ✅      |
| WS subprotocol selection | ✅   | ✅   | ✅      |
| WS bufferedAmount        | ✅   | ✅   | ✅      |
| WS ping / pong callbacks | ✅   | ❌\† | ✅      |
| WS drain callback        | ✅   | ✅\‡ | ✅\¶    |
| WS error callback        | ✅\§ | ✅   | ✅      |
| Backlog option           | ❌   | ✅   | ✅      |
| ReusePort                | ❌   | ✅   | ✅\‖    |
| Graceful shutdown        | ✅   | ✅   | ✅      |
| Request metrics          | ✅   | ✅   | ✅      |
| Abort signal             | ✅   | ✅   | ✅      |

\* Node.js WebSocket support is built on the [`ws`][ws-pkg] npm
package (a normal dependency of `@tundralibs/compat`). Pure-JS, no
native deps.\
\† Deno's WebSocket consumes ping/pong frames internally; user
callbacks are unreachable. Hard runtime limit.\
\‡ Deno doesn't surface backpressure events; best-effort emulation by
polling `bufferedAmount` after each `send()` — it may not fire when the
OS flushes a small/loopback write synchronously (`bufferedAmount` never
rises).\
\§ Bun's runtime has no `error` callback; we wrap user handlers in
try/catch and synthesize `error` events from caught throws.\
\¶ Node fires `drain` from the underlying `net.Socket`'s own `drain`
event (the `ws` package has no WebSocket-level equivalent), so — unlike
Deno's `bufferedAmount` polling — it reflects real socket backpressure:
the callback runs when a send buffer that had filled empties again.\
\‖ Node passes `reusePort` through `server.listen({ … })`, but only
where the kernel exposes `SO_REUSEPORT` (Linux, FreeBSD, illumos/Solaris,
AIX) and on Node ≥ 22.12. On macOS and Windows Node would raise `ENOTSUP`,
so it is skipped there and becomes a no-op — matching Deno/Bun, which
tolerate it silently on unsupported platforms rather than erroring.

[ws-pkg]: https://github.com/websockets/ws

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
import { WebServer } from 'jsr:@tundralibs/compat/webserver';
```

## Quick Start

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('MyAPI', {
  mode: 'TCP',
  port: 8080,
  handler: (request, info) => {
    return new Response(`Hello! Request ID: ${info.requestId}`);
  },
});

server.on('onStart', (name, mode) => {
  console.log(`${name} started on ${server.address}`);
});

server.start();
```

## Configuration

### TCP Mode

Standard HTTP server on a TCP port:

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('API', {
  mode: 'TCP',
  port: 3000, // Default: 8008
  hostname: '0.0.0.0', // Default: 'localhost'
  backlog: 511, // Connection queue size (Deno/Node only; ignored on Bun)
  reusePort: true, // Allow port reuse (Deno + Node on SO_REUSEPORT platforms — see Features table)
  handler: (req, info) => new Response('OK'),
});
```

| Option        | Type               | Default       | Description                                                                                   |
| ------------- | ------------------ | ------------- | --------------------------------------------------------------------------------------------- |
| `mode`        | `'TCP'`            | Required      | Server mode                                                                                   |
| `port`        | `number`           | `8008`        | Port number (0-65535)                                                                         |
| `hostname`    | `string`           | `'localhost'` | Bind address                                                                                  |
| `backlog`     | `number`           | -             | Connection queue size                                                                         |
| `reusePort`   | `boolean`          | -             | Allow multiple processes to bind (Deno + Node on SO_REUSEPORT platforms — see Features table) |
| `handler`     | `Function`         | Required      | Request handler                                                                               |
| `tls`         | `TLSOptions`       | -             | TLS configuration                                                                             |
| `websocket`   | `WebSocketHandler` | -             | WebSocket handlers                                                                            |
| `abortSignal` | `AbortSignal`      | -             | Signal for graceful shutdown                                                                  |
| `metrics`     | `boolean`          | `false`       | Opt-in metrics collection                                                                     |

### UNIX Mode

Unix domain socket server (IPC):

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('LocalAPI', {
  mode: 'UNIX',
  unixSocketPath: '/var/run/myapp.sock',
  handler: (req, info) => new Response('OK'),
});
```

| Option           | Type               | Description                  |
| ---------------- | ------------------ | ---------------------------- |
| `mode`           | `'UNIX'`           | Server mode                  |
| `unixSocketPath` | `string`           | Path to socket file          |
| `handler`        | `Function`         | Request handler              |
| `websocket`      | `WebSocketHandler` | WebSocket handlers           |
| `abortSignal`    | `AbortSignal`      | Signal for graceful shutdown |

Connect via curl:

```bash
curl --unix-socket /var/run/myapp.sock http://localhost/
```

### TLS/HTTPS

**File-based certificates:**

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('SecureAPI', {
  mode: 'TCP',
  port: 443,
  tls: {
    certFile: '/etc/ssl/cert.pem',
    keyFile: '/etc/ssl/key.pem',
    caFile: '/etc/ssl/ca.pem', // Optional
  },
  handler: (req) => new Response('Secure!'),
});
```

**String-based certificates:**

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('SecureAPI', {
  mode: 'TCP',
  port: 443,
  tls: {
    cert: '-----BEGIN CERTIFICATE-----\n...',
    key: '-----BEGIN PRIVATE KEY-----\n...',
    ca: ['-----BEGIN CERTIFICATE-----\n...'],
  },
  handler: (req) => new Response('Secure!'),
});
```

### WebSocket

See [WebSocket Documentation](../websocket/Compat-WebSocket.md) for complete details.

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('WSServer', {
  mode: 'TCP',
  port: 8080,
  handler: (req) => new Response('HTTP endpoint'),
  websocket: {
    open: (ws, ctx) => {
      console.log('Client connected from', ctx.remoteAddress);
    },
    message: (ws, data) => {
      ws.send(`Echo: ${data}`);
    },
    close: (ws, code, reason) => {
      console.log(`Client disconnected: ${code}`);
    },
    error: (ws, error) => {
      console.error('WebSocket error:', error);
    },
    idleTimeout: 120, // seconds
  },
});
```

#### Upgrade hook

Add an `upgrade` callback to authenticate, refuse, pick subprotocols,
or attach typed connection state — runs once per incoming upgrade,
before the handshake completes.

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

declare function verifyToken(token: string | null): string | null;

type ConnState = { userId: string };

const server = new WebServer<ConnState>('WSServer', {
  mode: 'TCP',
  port: 8080,
  handler: () => new Response('OK'),
  websocket: {
    upgrade: (req, info) => {
      // Authenticate
      const token = req.headers.get('authorization');
      const userId = verifyToken(token);
      if (!userId) return false; // Refuse — falls through to HTTP handler

      // Pick a subprotocol from the client's offer
      const requested = req.headers.get('sec-websocket-protocol')
        ?.split(',').map((s) => s.trim()) ?? [];
      const protocol = requested.includes('tundra-v1')
        ? 'tundra-v1'
        : undefined;

      return { data: { userId }, protocol };
    },
    open: (ws) => {
      // ws.data is typed `ConnState` — populated by the upgrade hook
      console.log('user joined:', ws.data.userId);
    },
    message: (ws, data) => {
      // ws.bufferedAmount tells you how much is queued
      if (ws.bufferedAmount > 1_000_000) {
        ws.close(1008, 'slow consumer');
        return;
      }
      ws.send(`Echo: ${data}`);
    },
  },
});
```

**Upgrade decisions:**

| Return        | Effect                                                      |
| ------------- | ----------------------------------------------------------- |
| `false`       | Refuse — request flows to HTTP handler (return 401/403/etc) |
| `true`        | Accept with default behavior (back-compat with no hook)     |
| `{ data, … }` | Accept and attach `data` as the connection's typed state    |

The decision object can also carry `protocol` (chosen subprotocol from
`Sec-WebSocket-Protocol`) and `headers` (extra headers in the 101
response).

When no `upgrade` hook is supplied, every WebSocket upgrade is
accepted and `ws.data` defaults to the upgrade context — preserves
behavior for code written before the hook existed.

#### Bypassing the compat WebSocket layer (native APIs)

The `websocket` option is opt-in. If you want full control over the
WebSocket handshake — non-standard frames, binary protocols beyond
what the compat shape allows, integration with libraries that expect
the runtime's native WebSocket type — you can skip it entirely and
handle the upgrade inside your HTTP `handler`. Below is the same echo
server written natively for each runtime, _without_ `WebServer` at
all, for comparison.

**Bun** — `Bun.serve()` returns a WS-aware server:

```ts ignore
Bun.serve({
  port: 8080,
  fetch(req, server) {
    if (server.upgrade(req)) return; // hands the connection off to `websocket` below
    return new Response('hello');
  },
  websocket: {
    open(ws) {
      ws.send('welcome');
    },
    message(ws, msg) {
      ws.send(`echo: ${msg}`);
    },
  },
});
```

**Deno** — `Deno.upgradeWebSocket()` inside any HTTP handler:

```ts
Deno.serve({ port: 8080 }, (req) => {
  if (req.headers.get('upgrade') === 'websocket') {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => socket.send('welcome');
    socket.onmessage = (ev) => socket.send(`echo: ${ev.data}`);
    return response;
  }
  return new Response('hello');
});
```

**Node.js** — `ws` package directly on `http.Server`:

```ts
import { createServer } from 'node:http';
import { WebSocketServer as WsLib } from 'ws';

const server = createServer((_, res) => res.end('hello'));
const wss = new WsLib({ server });
wss.on('connection', (ws) => {
  ws.send('welcome');
  ws.on('message', (msg) => ws.send(`echo: ${msg}`));
});
server.listen(8080);
```

**Hybrid** — keep `WebServer` for HTTP routes + non-WS features, but
have its upgrade hook decline so you can do the WS handshake natively
in a sibling server. Less common; usually the compat `websocket`
option (with the `upgrade` hook) is sufficient. The hybrid pattern
makes sense only when you need a third-party library that consumes
the runtime's native WebSocket type and won't accept the compat
`ServerWebSocket<T>` shape.

## API Reference

### Constructor

```typescript ignore
new WebServer<T = unknown>(name: string, options: ServerOptions<ServerMode, T>)
```

Creates a new server instance. Validates all options during construction.

**Type parameter:**

- `T` — type of the custom data attached to each WebSocket connection
  (set by the `upgrade` hook's return value, surfaced as `ws.data`).
  Defaults to `unknown` for callers not using WebSocket or not
  customizing connection state.

**Parameters:**

- `name` - Unique server name (used in events/logging)
- `options` - Server configuration

**Throws:**

- `ServerConfigurationError` - Invalid configuration
- `ServerPermissionError` - Insufficient file permissions

### Properties

| Property  | Type              | Description                          |
| --------- | ----------------- | ------------------------------------ |
| `name`    | `string`          | Server name (readonly)               |
| `mode`    | `'TCP' \| 'UNIX'` | Server mode (readonly)               |
| `options` | `ServerOptions`   | Configuration (readonly)             |
| `state`   | `ServerState`     | Current lifecycle state              |
| `address` | `string \| null`  | Listening address or null if stopped |
| `metrics` | `ServerMetrics`   | Performance metrics (copy)           |

### Methods

#### `async start(): Promise<void>`

Starts the server and begins accepting connections.

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

server.start();
console.log(`Listening on ${server.address}`);
```

**Throws:**

- `ServerAlreadyRunningError` - Server not in STOPPED state
- `UnsupportedRuntimeError` - Runtime cannot host a server (Workers,
  browsers, and any runtime other than Bun/Deno/Node)
- `ServerError` - Failed to bind

#### `stop(graceful?: boolean): Promise<void>`

Stops the server.

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

// Graceful: wait for active requests
await server.stop();

// Force: close immediately
await server.stop(false);
```

**Throws:**

- `ServerNotRunningError` - Server not in RUNNING state
- `UnsupportedRuntimeError` - Runtime cannot host a server
- `ServerError` - The stop operation itself failed

#### `on(event, listener): void`

Registers an event listener.

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

server.on('onResponse', (name, req, info, res) => {
  console.log(`${req.method} ${req.url} → ${res.status}`);
});
```

#### `off(event, listener?): void`

Removes event listener(s).

```typescript
import type { ServerEvents, WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;
declare const myHandler: ServerEvents['onError'];

// Remove specific listener
server.off('onError', myHandler);

// Remove all listeners for event
server.off('onError');
```

#### `ref(): void`

Marks server as referenced (prevents process exit).

**Throws:**

- `ServerNotRunningError` - Server is not in RUNNING state (also
  thrown if called before the first `start()`)
- `UnsupportedRuntimeError` - Runtime cannot host a server
- `ServerError` - The underlying `ref()` call failed

#### `unref(): void`

Marks server as unreferenced (allows process exit).

**Throws:** same as `ref()` — `ServerNotRunningError` / `UnsupportedRuntimeError` / `ServerError`.

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const metricsServer: WebServer;

// Metrics server that won't block shutdown
metricsServer.start();
metricsServer.unref();
```

#### `resetMetrics(): void`

Resets all metrics to initial values.

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

setInterval(() => {
  console.log('Hourly stats:', server.metrics);
  server.resetMetrics();
}, 3600000);
```

## Events

| Event        | Parameters                        | Description                        |
| ------------ | --------------------------------- | ---------------------------------- |
| `onStart`    | `(name, mode)`                    | Server started                     |
| `onClose`    | `(name, mode)`                    | Server stopped                     |
| `onResponse` | `(name, request, info, response)` | Request completed                  |
| `onError`    | `(name, error, request?, info?)`  | Error occurred                     |
| `onWarning`  | `(name, message)`                 | Warning (e.g., unsupported option) |

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;

server.on('onStart', (name, mode) => {
  console.log(`[${name}] Started in ${mode} mode`);
});

server.on('onResponse', (name, req, info, res) => {
  console.log(`[${info.requestId}] ${req.method} ${req.url} → ${res.status}`);
});

server.on('onError', (name, error, req, info) => {
  console.error(`[${name}] Error:`, error.message);
  if (req) console.error(`  Request: ${req.method} ${req.url}`);
});
```

## Metrics

Collection is **opt-in**: pass `metrics: true` in the constructor
options. Without it every counter reads back zero (the collection work
is skipped entirely — consumers with their own observability stack
shouldn't pay for it per request).

```typescript
import type { WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer; // constructed with `metrics: true`

const metrics = server.metrics;

// Request metrics
console.log(`Total: ${metrics.requests.total}`);
console.log(`Active: ${metrics.requests.active}`);
console.log(`Peak: ${metrics.requests.peakActive}`);

// Status codes
console.log(`Success: ${metrics.statusCodes['2xx']}`);
console.log(`Errors: ${metrics.statusCodes['5xx']}`);

// Response times (ms)
console.log(`Min: ${metrics.responseTime.min.toFixed(2)}ms`);
console.log(`Max: ${metrics.responseTime.max.toFixed(2)}ms`);
console.log(`Avg: ${metrics.responseTime.average.toFixed(2)}ms`);

// WebSocket metrics
console.log(`WS Connections: ${metrics.websocket.connections.active}`);
console.log(`WS Messages: ${metrics.websocket.messages.received}`);
```

## Examples

### REST API with JSON

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server = new WebServer('RestAPI', {
  mode: 'TCP',
  port: 3000,
  handler: async (req, info) => {
    const url = new URL(req.url);

    if (url.pathname === '/users' && req.method === 'GET') {
      return Response.json({ users: [] });
    }

    if (url.pathname === '/users' && req.method === 'POST') {
      const body = await req.json();
      return Response.json({ id: 1, ...body }, { status: 201 });
    }

    return new Response('Not Found', { status: 404 });
  },
});

server.start();
```

### Graceful Shutdown with Abort Signal

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const controller = new AbortController();

const server = new WebServer('API', {
  mode: 'TCP',
  port: 8080,
  handler: (req) => new Response('OK'),
  abortSignal: controller.signal,
});

server.start();

// Graceful shutdown on SIGINT
process.on('SIGINT', () => {
  console.log('Shutting down...');
  controller.abort();
});
```

### Metrics Endpoint

```typescript
import { WebServer } from '@tundralibs/compat/webserver';

const server: WebServer = new WebServer('API', {
  mode: 'TCP',
  port: 8080,
  metrics: true, // collection is opt-in
  handler: (req, info): Response => {
    const url = new URL(req.url);

    if (url.pathname === '/metrics') {
      return Response.json(server.metrics);
    }

    return new Response('OK');
  },
});
```

### Multi-Listener Logging

```typescript
import type { RequestInfo, WebServer } from '@tundralibs/compat/webserver';

declare const server: WebServer;
declare const metricsCollector: {
  record(req: Request, res: Response, info: RequestInfo): void;
};
declare const alertService: { warn(message: string): void };

server.on('onResponse', [
  // Console logging
  (name, req, info, res) => {
    console.log(`${req.method} ${req.url} → ${res.status}`);
  },
  // Metrics collection
  (name, req, info, res) => {
    metricsCollector.record(req, res, info);
  },
  // Slow request alerting
  (name, req, info, res) => {
    const duration = Date.now() - info.requestTime.getTime();
    if (duration > 5000) {
      alertService.warn(`Slow request: ${req.url} took ${duration}ms`);
    }
  },
]);
```

## Runtime Compatibility

### Bun

- Full HTTP/HTTPS support
- Native WebSocket (best performance)
- `error` callback synthesized from caught throws in user handlers
  (Bun's runtime doesn't expose a native error callback)
- `backlog` option ignored (warning emitted)

### Deno

- Full HTTP/HTTPS support
- WebSocket via `Deno.upgradeWebSocket()`
- `ping` / `pong` callbacks unavailable — Deno consumes those frames
  internally (hard runtime limit)
- `drain` callback best-effort via `bufferedAmount` polling (~50ms tick);
  may not fire on synchronous local flushes (see the Features table)
- All other options supported

### Node.js

- Full HTTP/HTTPS support
- WebSocket via the [`ws`][ws-pkg] npm package (taken as a normal
  dependency of `@tundralibs/compat`), loaded lazily on `start()` so
  importing the module never pulls it in
- `backlog` supported; `reusePort` honored on `SO_REUSEPORT` platforms
  (Node ≥ 22.12), a no-op on macOS/Windows (see the Features table)
- `drain` callback fires from the underlying socket's `drain` event —
  it reflects real send backpressure (see the Features table)
- Node's HTTP server hands the handler an `IncomingMessage`, not a Fetch
  `Request`, so `WebServer` passes a lightweight `Request`-shaped view
  instead of building one eagerly (a measurable throughput win — see
  [`bench/OPTIMIZATION-NOTES.md`](bench/OPTIMIZATION-NOTES.md)). It is a
  faithful `Request`: `instanceof Request` holds and every member
  (`method`/`url`/`headers`/`body`, `text()`/`json()`/`arrayBuffer()`/
  `formData()`/`clone()`, `signal`, …) behaves identically. The one
  edge: `bodyUsed` only flips `true` once a body-**read** method is
  called — reading the raw `body` stream directly does not update it.
  Consume the body through one path (a read method **or** the stream,
  not both, and once), as Fetch already requires, and this never
  surfaces.

### Cloudflare Workers, browsers, and other runtimes

`WebServer` needs a port-listening HTTP server, which these runtimes do
not provide. Construction is safe — `new WebServer(...)` never throws on
them (the filesystem-touching option validation for UNIX sockets and
file-based TLS is skipped) — but `start()` rejects with
[`UnsupportedRuntimeError`](../Error.ts) (`operation: 'WebServer.start'`).
Gate on `isWorkers` / `isBrowser` from `@tundralibs/compat/runtime`, or
catch the error. On Cloudflare Workers, export a `fetch` handler instead
of starting a server.

[ws-pkg]: https://github.com/websockets/ws

## Related Documentation

- [WebSocket Guide](docs/Compat-WebServer-WebSocket.md) - WebSocket setup and authentication
- [TLS Configuration](docs/Compat-WebServer-TLS.md) - HTTPS and certificate setup
- [Metrics Reference](docs/Compat-WebServer-Metrics.md) - Understanding server metrics
- [Error Handling](docs/Compat-WebServer-Errors.md) - Error types and handling

---

[← Back to Compat](../README.md)

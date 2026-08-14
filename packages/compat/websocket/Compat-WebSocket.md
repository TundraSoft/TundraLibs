# Compat-WebSocket

Middleware-aware WebSocket server primitive on top of
`compat/webserver`'s WebSocket support. Two ways to use it: mounted
into an existing `WebServer`, or standalone.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [API](#api)
- [Codecs](#codecs)
- [Frame-size limit](#frame-size-limit)
- [Backpressure observation](#backpressure-observation)
- [Scenarios](#scenarios)
  - [Mounted alongside HTTP routes](#mounted-alongside-http-routes)
  - [Standalone server](#standalone-server)
  - [Authenticated upgrade with typed connection state](#authenticated-upgrade-with-typed-connection-state)
  - [JSON messages](#json-messages)
  - [Binary messages](#binary-messages)
  - [Custom codec](#custom-codec)
  - [Middleware: timing + logging](#middleware-timing--logging)
  - [Broadcasting to all connections](#broadcasting-to-all-connections)
- [Looking for command routing or pub/sub?](#looking-for-command-routing-or-pubsub)
- [Runtime support](#runtime-support)
- [Related Documentation](#related-documentation)

## Overview

`WebSocketServer` is intentionally opinion-light. It gives you:

- **Middleware composition** over every incoming message (Koa-style).
- **Pluggable codec** — string identity by default; built-in
  `JsonCodec` and `BinaryCodec` ship alongside; bring your own for
  MessagePack, CBOR, custom envelopes, etc.
- **Frame-size limit** — drops oversized frames before decoding
  (default 1 MB; configurable, set to 0 to disable).
- **Backpressure observation** — optional `onBackpressure` hook fires
  when `ws.bufferedAmount` crosses a configurable threshold after a
  server-side send.
- **Lifecycle hooks** — `onOpen`, `onMessage`, `onClose`,
  `onDecodeError`, `onBackpressure`, `onError`.
- **Connection tracking** — `wss.connections` exposes a snapshot of
  open sockets, `wss.broadcast(msg)` encodes once and sends to all.

What it deliberately does **not** include: command dispatch, channels,
id-correlated request/response, pub/sub adapters. If you want those,
reach for [`@tundralibs/rpc`](../../rpc/README.md), which composes on
top of this primitive.

### Features

| Feature                       | Bun | Deno | Node |
| ----------------------------- | --- | ---- | ---- |
| Middleware (Koa-style)        | ✅  | ✅   | ✅   |
| Pluggable codec               | ✅  | ✅   | ✅   |
| `onOpen` / `onClose` hooks    | ✅  | ✅   | ✅   |
| `wss.connections` iterable    | ✅  | ✅   | ✅   |
| `wss.broadcast(msg)`          | ✅  | ✅   | ✅   |
| Standalone `listen()`         | ✅  | ✅   | ✅   |
| Mountable on `WebServer`      | ✅  | ✅   | ✅   |
| String / JSON / binary codecs | ✅  | ✅   | ✅   |

## Quick start

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer();

wss.onMessage((ctx) => {
  ctx.ws.send(`echo: ${ctx.message}`);
});

await wss.listen({ port: 8080 });
```

Want to broadcast to all connected clients?

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

declare const wss: WebSocketServer;

wss.onMessage((ctx) => {
  wss.broadcast(`from ${ctx.ws.remoteAddress}: ${ctx.message}`);
});
```

## API

### `new WebSocketServer<T = unknown, M = string>(options?)`

```ts ignore
type WebSocketServerOptions<T, M> = {
  codec?: Codec<M>; // defaults to StringCodec
  upgrade?: (req, info) => UpgradeDecision<T> | Promise<UpgradeDecision<T>>;
};
```

`T` is the per-connection state type (`ws.data`); `M` is the decoded
message shape — defaults to `string` (text frames passed through via
the built-in `StringCodec`).

The `upgrade` hook (same shape as `WebSocketHandler.upgrade` in
`compat/webserver`) decides what `T` becomes for each connection —
return `false` to refuse, `true` to accept with default data, or
`{ data, protocol?, headers? }` to attach typed state.

### Configuration (chainable)

```ts ignore
wss.use(middleware); // Koa-style middleware
wss.onMessage(handler); // terminal — runs after all middleware
wss.onOpen(handler); // connection opened
wss.onClose(handler); // connection closed
wss.onDecodeError(handler); // frame oversize or codec returned null
wss.onBackpressure(handler); // ws.bufferedAmount over threshold
wss.onError(handler); // any unhandled throw in middleware/onMessage
```

Each `on*` registration replaces the previous. `use()` appends.

### Send + lifecycle

```ts ignore
wss.handlers(); // → WebSocketHandler<T>, pass to WebServer
await wss.listen({ port }); // standalone — internal WebServer
wss.send(ws, message); // codec-encode, send to one ws, observe backpressure
wss.broadcast(message); // codec-encode once, send to every open connection
wss.connections; // snapshot of open sockets (ReadonlyArray)
await wss.close(); // tear down
```

### Limits + backpressure

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

new WebSocketServer({
  maxFrameSize: 1_048_576, // bytes — default 1 MB; 0 disables
  backpressureThreshold: 16_384, // bytes — undefined disables observation
});
```

- **`maxFrameSize`** — frames larger than this are rejected before
  decoding. The server fires `onDecodeError(ws, raw, 'oversize')`.
  Default `1 MB`; set to `0` to disable.
- **`backpressureThreshold`** — when set, after every send via
  `wss.send` / `wss.broadcast`, if `ws.bufferedAmount` exceeds this,
  `onBackpressure(ws, bufferedAmount)` fires. Direct `ctx.ws.send(...)`
  is **not** observed — for those, read `ws.bufferedAmount` yourself.

## Codecs

A `Codec<M>` is just `{ encode(M) → wire, decode(wire) → M | null }`.
Three built-ins ship in this module:

```ts
import {
  BinaryCodec,
  JsonCodec,
  StringCodec,
  WebSocketServer,
} from '@tundralibs/compat/websocket';

new WebSocketServer(); // M = string  (StringCodec)
new WebSocketServer({ codec: JsonCodec }); // M = unknown (JSON.parse / stringify)
new WebSocketServer({ codec: BinaryCodec }); // M = Uint8Array (binary identity)
```

`decode` returns `null` for malformed input; the framework routes that
to `onDecodeError` (or drops silently when no handler is set). For
custom codecs, implement the same shape:

```ts
import type { Codec } from '@tundralibs/compat/websocket';

declare const msgpack: {
  encode(msg: unknown): Uint8Array;
  decode(raw: Uint8Array): unknown;
};

const MsgpackCodec: Codec<unknown> = {
  encode: (msg) => msgpack.encode(msg),
  decode: (raw) => {
    if (!(raw instanceof Uint8Array)) return null;
    try {
      return msgpack.decode(raw);
    } catch {
      return null;
    }
  },
};
```

## Frame-size limit

By default, incoming frames over `1 MB` are rejected before reaching
the codec — `onDecodeError(ws, raw, 'oversize')` fires so you can
react (close the connection, log, send a structured rejection).

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer({
  maxFrameSize: 256 * 1024, // 256 KB
});

wss.onDecodeError((ws, _raw, reason) => {
  if (reason === 'oversize') ws.close(1009, 'frame too large');
});
```

The check measures **byte length**: `byteLength` for binary frames,
UTF-8 byte length for text frames (with a fast path that avoids
allocation for the common cases of `length > max` or `length * 4 ≤
max`). Set `maxFrameSize: 0` to disable the check entirely.

## Backpressure observation

Set `backpressureThreshold` to be notified when a connection's
outbound buffer climbs above a byte threshold after a server-side
send.

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer({
  backpressureThreshold: 64 * 1024, // 64 KB
});

wss.onBackpressure((ws, buffered) => {
  console.warn(`slow consumer: ${ws.remoteAddress} buffered=${buffered}`);
  // Decide your policy: ws.close(1013, 'too slow'), drop, or just log.
});
```

The hook fires after `wss.send(ws, msg)` and `wss.broadcast(msg)`.
Direct `ctx.ws.send(...)` is **not** observed — those are escape
hatches; if you need observation there, route through `wss.send`
or read `ws.bufferedAmount` yourself.

The hook is informational only — it doesn't enforce anything.
Implement your own policy.

## Scenarios

### Mounted alongside HTTP routes

Share one server, one port, one TLS config between REST and realtime.

```ts
import { WebServer } from '@tundralibs/compat/webserver';
import { WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer();
wss.onMessage((ctx) => ctx.ws.send(`echo: ${ctx.message}`));

const server = new WebServer('API', {
  mode: 'TCP',
  port: 8080,
  handler: (req) => {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    return new Response('Not Found', { status: 404 });
  },
  websocket: wss.handlers(),
});

await server.start();
```

### Standalone server

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer();
wss.onMessage((ctx) => ctx.ws.send(`echo: ${ctx.message}`));

await wss.listen({ port: 8080 });
```

You can pass a `httpHandler` if you want non-WS requests to do
something other than 404:

```ts
import type { WebSocketServer } from '@tundralibs/compat/websocket';

declare const wss: WebSocketServer;

await wss.listen({
  port: 8080,
  httpHandler: () => new Response('Use the WebSocket endpoint'),
});
```

### Authenticated upgrade with typed connection state

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

declare function verifyToken(token: string | null): string | null;

type Conn = { userId: string };

const wss = new WebSocketServer<Conn>({
  upgrade: (req) => {
    const userId = verifyToken(req.headers.get('authorization'));
    if (!userId) return false; // 401-equivalent — falls through to HTTP
    return { data: { userId } };
  },
});

wss.onMessage((ctx) => {
  // ctx.ws.data is typed as Conn
  console.log(`message from ${ctx.ws.data.userId}: ${ctx.message}`);
});
```

### JSON messages

```ts
import { JsonCodec, WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer({ codec: JsonCodec });

wss.onMessage((ctx) => {
  // ctx.message is `unknown` — assert / validate as needed
  wss.broadcast({ received: ctx.message, at: Date.now() });
});

wss.onDecodeError((ws, _raw, reason) => {
  // reason is 'oversize' or 'malformed'
  ws.send(JSON.stringify({ error: `bad frame: ${reason}` }));
});

await wss.listen({ port: 8080 });
```

### Binary messages

```ts
import { BinaryCodec, WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer({ codec: BinaryCodec });

wss.onMessage((ctx) => {
  // ctx.message is Uint8Array
  console.log('binary frame, length:', ctx.message.byteLength);
});

await wss.listen({ port: 8080 });
```

### Custom codec

Bring your own — anything that satisfies `Codec<M>` works. Below: a
length-prefixed text protocol where each frame is `<n>:<payload>`.

```ts
import { type Codec, WebSocketServer } from '@tundralibs/compat/websocket';

type LpFrame = { length: number; payload: string };

const LpCodec: Codec<LpFrame> = {
  encode: ({ length, payload }) => `${length}:${payload}`,
  decode: (raw) => {
    if (typeof raw !== 'string') return null;
    const colon = raw.indexOf(':');
    if (colon <= 0) return null;
    const length = Number(raw.slice(0, colon));
    if (!Number.isInteger(length) || length < 0) return null;
    const payload = raw.slice(colon + 1);
    if (payload.length !== length) return null;
    return { length, payload };
  },
};

const wss = new WebSocketServer({ codec: LpCodec });
```

### Middleware: timing + logging

```ts
import type { WebSocketServer } from '@tundralibs/compat/websocket';

declare const wss: WebSocketServer;

wss.use(async (ctx, next) => {
  const t0 = performance.now();
  try {
    await next();
  } finally {
    console.log(`message ${performance.now() - t0 | 0}ms`);
  }
});
```

Run this middleware **first** (registered before others) so its
`finally` block sees the total elapsed time including downstream
middleware and the terminal `onMessage` handler.

### Broadcasting to all connections

```ts
import { WebSocketServer } from '@tundralibs/compat/websocket';

const wss = new WebSocketServer();

setInterval(() => {
  wss.broadcast(`tick: ${Date.now()}`);
}, 1000);
```

`broadcast()` encodes once and writes to every open connection. Dead
sockets are skipped (errors swallowed) so a single failed send won't
block the others.

For per-connection filtering, iterate `wss.connections` directly:

```ts
import type { WebSocketServer } from '@tundralibs/compat/websocket';

declare const wss: WebSocketServer<{ role?: string }>;

for (const ws of wss.connections) {
  if (ws.data?.role === 'admin') {
    ws.send('admin ping');
  }
}
```

## Looking for command routing or pub/sub?

`WebSocketServer` is the primitive — it has no opinion on the wire
protocol. For a higher-level RPC + pub/sub framework with:

- Id-correlated request/response (`{ id, type, cmd, payload }`
  envelopes)
- Command router with optional payload validation
- Per-command middleware
- Channel registry (`subscribe`, `unsubscribe`, server-initiated
  publish, client publish via `onPublish`)
- Pluggable pub/sub adapters (in-memory by default; bring your own
  Redis / Kafka / NATS adapter for cross-process broadcast)

… use [`@tundralibs/rpc`](../../rpc/README.md), which composes on top of
this primitive.

## Runtime support

The primitive is pure JS on top of `compat/webserver` — it inherits
whatever that module supports. Today that means:

- **Bun**: native WebSocket
- **Deno**: native WebSocket via `Deno.upgradeWebSocket()`
- **Node**: WebSocket via the `ws` npm package

`WebSocketServer` itself has no runtime branches.

## Related Documentation

- [Middleware Patterns](docs/Compat-WebSocket-Middleware.md) — Koa-style
  composition, ordering, error routing, recipes
- [`@tundralibs/rpc`](../../rpc/README.md) — RPC + pub/sub framework on
  top of this primitive
- [Compat-WebServer](../webserver/Compat-WebServer.md) — the cross-runtime
  HTTP/HTTPS server `WebSocketServer` mounts on (or runs through, when
  using `listen()` standalone)

---

[← Back to Compat](../README.md)

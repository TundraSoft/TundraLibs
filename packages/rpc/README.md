# RPC

RPC + pub/sub framework over WebSocket. `Server` + `Client` with
id-correlated request/response, Koa-style middleware on both ends,
channels with pluggable adapters, and a stable JSON wire protocol.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

Built on top of [`@tundralibs/compat/websocket`](../compat/websocket/Compat-WebSocket.md)'s
`WebSocketServer` primitive — this package adds:

- **Command router** — typed map of `cmd` → handler with optional
  payload validation. Handlers return values that flow back to the
  client as a `result` frame.
- **Koa-style middleware** — composes around every command. Use it for
  auth, logging, rate limits, request-scoped state.
- **Channels & pub/sub** — `subscribe` / `unsubscribe` / `publish`
  over named channels. Default adapter is in-memory; plug in Redis or
  another cross-process adapter when you need fan-out across instances.

It is transport-agnostic: the same `Server` instance can be mounted
via `server.handlers()` or run standalone via `server.listen()`.

## Browser / Worker compatibility

`@tundralibs/rpc` is a WebSocket-oriented server package. The runtime is
intended for Deno, Bun, and Node server environments, and the
conformance adapter test path is intentionally excluded from the public
barrel because it pulls in a test framework that browser and edge-worker
bundlers cannot resolve.

The supported runtime shape is a server process with real WebSocket
lifecycle and socket state. Browser and worker bundles should use the
package only for non-test client-side integrations, and should not rely
on the internal test adapter or server-only path in a worker script.

## Modules

| Module           | Description                                                                            | Documentation                                              |
| ---------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Server`         | Command router + channels + middleware                                                 | This page                                                  |
| Wire protocol    | JSON envelope frames, `decodeFrame` / `encodeFrame`                                    | [docs/Rpc-Protocol](docs/Rpc-Protocol.md)                  |
| Middleware       | Koa-style middleware patterns and recipes                                              | [docs/Rpc-Middleware](docs/Rpc-Middleware.md)              |
| Pub/Sub adapters | Adapter contract, capability flags, in-memory + Redis sketch, conformance test harness | [docs/Rpc-PubSub](docs/Rpc-PubSub.md)                      |
| Extending        | Subclass overrides — pattern subscribe, frame inspection                               | [docs/Rpc-Extending](docs/Rpc-Extending.md)                |
| `./pubsub`       | `PubSubAdapter` base + `MemoryPubSubAdapter`                                           | [docs/Rpc-PubSub](docs/Rpc-PubSub.md)                      |
| `./conformance`  | `runAdapterConformance` — adapter contract test harness (test files only)              | [docs/Rpc-PubSub](docs/Rpc-PubSub.md#testing-your-adapter) |

## Installation

**Deno:**

```bash
deno add @tundralibs/rpc
```

**Bun:**

```bash
bunx jsr add @tundralibs/rpc
```

**Node.js:**

```bash
npx jsr add @tundralibs/rpc
```

### Import

```typescript
import { Server } from '@tundralibs/rpc';
import { MemoryPubSubAdapter } from '@tundralibs/rpc/pubsub';
```

The adapter conformance harness ships on its own sub-path, and belongs
in test files only — it imports a test framework, which browser and
edge-worker bundlers cannot resolve:

```typescript
import { runAdapterConformance } from '@tundralibs/rpc/conformance';
```

## Wire protocol

JSON envelopes, one frame per WebSocket text message.

**Client → server:**

```jsonc
// Invoke a command
{ "id": "1", "type": "cmd", "cmd": "createUser", "payload": { "name": "Ada" } }

// Subscribe to a channel
{ "id": "2", "type": "sub", "channel": "chat:room1" }

// Unsubscribe
{ "id": "3", "type": "unsub", "channel": "chat:room1" }

// Publish to a channel (delegated to channel's onPublish handler)
{ "id": "4", "type": "pub", "channel": "chat:room1", "payload": { "text": "hi" } }
```

**Server → client:**

```jsonc
// Successful command result
{ "id": "1", "type": "result", "ok": true, "data": { "id": "u-1" } }

// Failed command
{ "id": "1", "type": "result", "ok": false, "error": { "code": "VALIDATION", "message": "name required" } }

// Subscribe / unsubscribe confirmation
{ "id": "2", "type": "subscribed",   "channel": "chat:room1" }
{ "id": "3", "type": "unsubscribed", "channel": "chat:room1" }

// Broadcast on a subscribed channel
{ "type": "msg", "channel": "chat:room1", "data": { "from": "u-1", "text": "hi" } }

// Out-of-band protocol error — the offending frame's id is echoed back
// when recoverable, so the client can fail the call fast (see Rpc-Protocol)
{ "id": "1", "type": "error", "code": "BAD_FORMAT", "message": "invalid frame" }
```

The `id` field correlates request / response. Server-initiated `msg`
frames omit it; `error` frames carry it when it can be recovered from
the offending inbound frame. Full reference:
[Rpc-Protocol](docs/Rpc-Protocol.md).

## Quick start

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

// Register a command
server.command('echo', undefined, (ctx) => ctx.payload);

// Register a channel
server.channel('news', {});

// Run standalone
await server.listen({ port: 8080 });

// Later, broadcast
await server.publish('news', { headline: 'Hello world' });

// Shut down
await server.close();
```

## API

### `new Server<T = unknown>(options?)`

Every option is optional; this spells all of them out at once.

```ts
import { Server } from '@tundralibs/rpc';
import { MemoryPubSubAdapter } from '@tundralibs/rpc/pubsub';

type Conn = { userId: string };

const server = new Server<Conn>({
  // Pub/sub adapter — this is the default when omitted.
  pubsub: new MemoryPubSubAdapter(),

  // Decides what `T` becomes for each connection.
  upgrade: (req, info) => {
    const userId = req.headers.get('x-user-id');
    if (!userId) return false; // refuse — falls through to HTTP
    console.log('upgrade from', info.remoteAddress);
    return { data: { userId } };
  },

  // Incoming frames over this many bytes are rejected before
  // decoding. Default 1 MB; 0 disables the cap.
  maxFrameSize: 1_048_576,

  // Outbound-buffer soft cap in bytes. Omit to disable observation.
  backpressureThreshold: 4 * 1_048_576,
  onBackpressure: (ws, bufferedAmount) => {
    console.warn('slow consumer', ws.data.userId, bufferedAmount);
  },
});
```

`T` is the per-connection state type. The `upgrade` hook (same shape
as `WebSocketHandler.upgrade` in `compat/webserver`) decides what `T`
becomes for each connection — return `false` to refuse, `true` to
accept with default data, or `{ data, protocol?, headers? }` to
attach typed state.

**Frame size:** incoming frames over `maxFrameSize` bytes are rejected
before decoding — the client receives an `error` frame with code
`FRAME_TOO_LARGE`. Default is 1 MB; raise it for binary uploads or
drop to a smaller cap for stricter shapes.

**Backpressure:** when `backpressureThreshold` is set, after every
server-side send (`publish`, command result, `subscribed`, `msg`),
if `ws.bufferedAmount` exceeds the threshold, the configured
`onBackpressure` handler fires for that connection. Implement your
own policy — close, log, or drop further sends.

### Configuration (chainable)

`use`, `command`, and `channel` all return the server, so registration
chains:

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server()
  // Koa-style middleware — wraps every command.
  .use(async (ctx, next) => {
    console.log('->', ctx.cmd);
    await next();
  })
  // Command with no validator — the handler gets the raw payload.
  .command('echo', undefined, (ctx) => ctx.payload)
  // Command with a validator — `ctx.payload` is the validator's return type.
  .command(
    'greet',
    (input) => input as { name: string },
    (ctx) => `hello ${ctx.payload.name}`,
  )
  // Channel registration — `{}` is subscribe-only, no hooks.
  .channel('news', {});
```

### Wire-up

```ts
import { Server } from '@tundralibs/rpc';
// Needs a separate install: deno add @tundralibs/compat
import type { WebSocketHandler } from '@tundralibs/compat/webserver';

const server = new Server();
server.channel('news', {});

// Either — mount into a WebServer you already run…
const handlers: WebSocketHandler<unknown> = server.handlers();
console.log('mount these on WebServer.websocket:', handlers);

// …or run standalone on an internally-managed WebServer.
await server.listen({ port: 8080 });

await server.publish('news', { headline: 'Hello' }); // broadcast
await server.close(); // tear down
```

## Scenarios

### Mounted alongside HTTP routes

The most common shape — REST + realtime sharing one server, one port,
one TLS config.

```ts
// Needs a separate install: deno add @tundralibs/compat
import { WebServer } from '@tundralibs/compat/webserver';
import { Server } from '@tundralibs/rpc';

const rpc = new Server();
rpc.command('ping', undefined, () => 'pong');

const handleUsers = (_req: Request): Response => new Response('[]');

const web = new WebServer('API', {
  mode: 'TCP',
  port: 8080,
  handler: (req) => {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/users') return handleUsers(req);
    return new Response('Not Found', { status: 404 });
  },
  websocket: rpc.handlers(),
});

await web.start();
```

### Standalone server

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();
server.command('echo', undefined, (ctx) => ctx.payload);

await server.listen({ port: 8080 });
// Later
await server.close();
```

## Client

`Client` is the matching counterpart to `Server` — same wire protocol,
parallel middleware mental model. Use it from browsers, Node, Deno,
or Bun via the platform's built-in `WebSocket`.

```ts
import { Client } from '@tundralibs/rpc';

const client = new Client({ url: 'ws://localhost:8080' });
await client.connect();

// Command
const reply = await client.command<{ text: string }>('echo', {
  text: 'hello',
});

// Subscribe to a server-side channel
const sub = await client.subscribe('news', (data) => {
  console.log('news:', data);
});
// …later
await sub.unsubscribe();

// Publish to a client-publishable channel. The server's channel must
// have `onPublish` configured, and — because a client `pub` inherits
// the subscribe-time authorization — you must be subscribed to that
// channel first, or the publish is rejected with `NOT_SUBSCRIBED`.
await client.subscribe('chat:room1', (data) => {
  console.log('chat:', data);
});
await client.publish('chat:room1', { from: 'me', text: 'hi' });

await client.close();
```

### `new Client(options)`

`url` is the only required option; the rest are shown here with their
defaults.

```ts
import { Client } from '@tundralibs/rpc';

const client = new Client({
  url: 'ws://localhost:8080', // ws:// or wss://

  // Sub-protocol(s) offered on the handshake. Nothing in this package
  // requires one — the server picks via its upgrade hook's `protocol`.
  protocols: ['my-app-v1'],

  defaultTimeoutMs: 30_000, // 0 disables command timeouts

  reconnect: {
    enabled: true,
    maxAttempts: 10,
    initialDelayMs: 500,
    backoffFactor: 2,
    maxDelayMs: 30_000,
  },

  // A subscription replayed after a reconnect was refused (the
  // connection lost its authorization, or the channel is gone). The
  // dead subscription has already been dropped when this fires.
  onSubscriptionError: (channel, error) => {
    console.warn('re-subscribe refused:', channel, error.message);
  },

  // Auto-reconnect exhausted `reconnect.maxAttempts`. The client now
  // stays DISCONNECTED and will not retry on its own.
  onReconnectFailed: (attempts) => {
    console.error(`gave up after ${attempts} attempts`);
  },
});
```

When `reconnect.enabled` is true (default), an unexpected close
triggers exponential-backoff retries up to `maxAttempts`. Active
subscriptions are re-established on reconnect. In-flight `command()`
calls reject with `CONNECTION_LOST`. While the client is parked between
retries its `state` reads `DISCONNECTED`; calling `connect()` in that
window cancels the pending retry and connects immediately rather than
racing the backoff into a second concurrent socket — this is the
intended way to recover after `onReconnectFailed`.

A manual `connect()` during backoff **supersedes** the parked retry but
never disables auto-reconnect: if that `connect()` itself fails (the
server is still down) the backoff schedule is re-armed, so the client
keeps retrying and reconnects on its own once the server returns — the
failed call still rejects so you can log or react to it. Only `close()`
stops reconnecting, and it does so **even when called during backoff**
(where `state` reads `DISCONNECTED`): it cancels the pending retry and
latches the closed state, so the client will not silently reconnect
later. A subsequent `connect()` clears that and reconnects normally.

### Middleware

Two middleware chains — one per direction:

```ts
import { Client } from '@tundralibs/rpc';

const client = new Client({ url: 'ws://localhost:8080' });
const getAuthToken = (): string => 'token';

client.useSend(async (ctx, next) => {
  // ctx.frame is the OUTBOUND frame (cmd / sub / unsub / pub).
  // Mutate, log, retry — then call next() to write the frame.
  if (ctx.frame.type === 'cmd') {
    ctx.frame.payload = {
      ...(ctx.frame.payload as object | undefined),
      token: getAuthToken(),
    };
  }
  await next();
});

client.useReceive(async (ctx, next) => {
  // ctx.frame is the INBOUND frame from the server. Skip next() to
  // drop the frame entirely.
  console.log('server frame:', ctx.frame.type);
  await next();
});
```

Send middleware runs in registration order; the last `next()` writes
the frame to the wire. Receive middleware runs in registration order;
the last `next()` performs the built-in dispatch (id correlation for
`result` frames, channel routing for `msg` frames). Errors thrown in
send middleware reject the awaiting caller of
`command()` / `subscribe()` / etc.

### Lifecycle

```ts
import { Client } from '@tundralibs/rpc';
import type { ClientState, ClientSubscription } from '@tundralibs/rpc';

const client = new Client({ url: 'ws://localhost:8080' });

// 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'CLOSING'
const state: ClientState = client.state;
console.log(state);

await client.connect(); // open WebSocket, resolves on 'open'

// Request/response — the type parameter types the resolved value.
const reply = await client.command<{ text: string }>('echo', { text: 'hi' });
console.log(reply.text);

// Returns a subscription handle.
const sub: ClientSubscription = await client.subscribe('chat:room1', (data) => {
  console.log('msg:', data);
});

// Ack'd publish — needs `onPublish` on the server's channel, and the
// active subscription above (see "Client publish via channel onPublish").
await client.publish('chat:room1', { text: 'hi' });

await sub.unsubscribe();
await client.close(); // graceful close, stops reconnects
```

## Server + Client end-to-end

```ts
import { Client, Server } from '@tundralibs/rpc';

// Server side
const server = new Server();
server.command('echo', undefined, (ctx) => ctx.payload);
server.channel('news', {});
await server.listen({ port: 8080, hostname: '127.0.0.1' });

// Client side (same process here for the demo; in practice the
// client lives in a browser / different process / different host)
const client = new Client({ url: 'ws://127.0.0.1:8080' });
await client.connect();

const echo = await client.command('echo', { text: 'hi' });
// → { text: 'hi' }

const sub = await client.subscribe('news', (data) => {
  console.log('news:', data);
});

// Server-initiated push reaches the client's handler.
await server.publish('news', { headline: 'Hello world' });

await sub.unsubscribe();
await client.close();
await server.close();
```

You can pass a `httpHandler` if you want non-WS requests to do
something other than 404:

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

await server.listen({
  port: 8080,
  httpHandler: () => new Response('Use the WebSocket endpoint'),
});
```

### Authenticated upgrade with typed connection state

```ts
import { Server } from '@tundralibs/rpc';

type Conn = { userId: string; subscriptions: Set<string> };

const verifyToken = (_token: string | null): string | undefined => undefined;

const server = new Server<Conn>({
  upgrade: (req) => {
    const token = req.headers.get('authorization');
    const userId = verifyToken(token);
    if (!userId) return false; // 401-equivalent — falls through to HTTP
    return {
      data: { userId, subscriptions: new Set() },
    };
  },
});

server.command('whoami', undefined, (ctx) => ({
  userId: ctx.ws.data.userId, // typed as `Conn`
}));

await server.listen({ port: 8080 });
```

### Command with schema validation (Guardian)

`Validator<T>` is a function `(input: unknown) => T | Promise<T>` —
any validator that throws on invalid input fits.

```ts
// Needs a separate install: deno add @tundralibs/guardian
import { Guardian } from '@tundralibs/guardian';
import { Server } from '@tundralibs/rpc';

const server = new Server();
const db = {
  users: {
    create: (_user: { name: string; email: string }) => Promise.resolve('u-1'),
  },
};

const CreateUser = Guardian.object({
  name: Guardian.string(),
  email: Guardian.string().email(),
});

server.command(
  'createUser',
  (input) => CreateUser.parse(input),
  async (ctx) => {
    // ctx.payload is typed as { name: string; email: string }
    const id = await db.users.create(ctx.payload);
    return { id };
  },
);
```

Plain hand-written validators work too:

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

server.command(
  'sendMessage',
  (input) => {
    if (typeof input !== 'object' || input === null) {
      throw new Error('expected object');
    }
    const text = (input as { text?: unknown }).text;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('text required');
    }
    return { text };
  },
  (ctx) => ({ ok: true, length: ctx.payload.text.length }),
);
```

### Middleware: timing + logging

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

server.use(async (ctx, next) => {
  const start = performance.now();
  try {
    await next();
    console.log(`${ctx.cmd} ok ${performance.now() - start | 0}ms`);
  } catch (err) {
    console.error(`${ctx.cmd} fail ${performance.now() - start | 0}ms`, err);
    throw err; // rethrow so the framework reports it as a result error
  }
});
```

### Middleware: auth required

A middleware can short-circuit by throwing — the framework converts
the throw into a `result` frame with `ok: false`. Custom error codes
flow through via `err.code`.

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

server.use(async (ctx, next) => {
  if (!(ctx.ws.data as { userId?: string }).userId) {
    const err = new Error('not authenticated') as Error & { code: string };
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  await next();
});
```

Or short-circuit silently (returns `ok: true` with no data):

```ts
import { Server } from '@tundralibs/rpc';
// Needs a separate install: deno add @tundralibs/compat
import type { ServerWebSocket } from '@tundralibs/compat/webserver';

const server = new Server();
const rateLimited = (_ws: ServerWebSocket<unknown>) => false;

server.use(async (ctx, next) => {
  if (rateLimited(ctx.ws)) {
    return; // skip handler, but ack the request
  }
  await next();
});
```

### Channel with authorize hook

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();
const canJoin = (_userId: string, _room: string): boolean => true;

server.channel('chat:room1', {
  authorize: (ctx) => {
    const userId = (ctx.ws.data as { userId?: string }).userId;
    return Boolean(userId && canJoin(userId, 'room1'));
  },
  onSubscribe: (ctx) => {
    console.log(`user joined chat:room1`);
  },
  onUnsubscribe: (ctx) => {
    console.log(`user left chat:room1`);
  },
});
```

### Server-initiated broadcast

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

// Anywhere on the server
await server.publish('chat:room1', {
  from: 'system',
  text: 'maintenance in 5 minutes',
});
```

Every subscriber on `chat:room1` (across all connections served by
this `Server`) receives a `msg` frame.

### Client publish via channel `onPublish`

By default, clients can only **subscribe** to channels — they can't
publish into them. Add an `onPublish` to opt in:

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();
const parseChatMessage = (payload: unknown) => payload as { text: string };

server.channel('chat:room1', {
  authorize: (ctx) => Boolean((ctx.ws.data as { userId?: string }).userId),
  onPublish: async (ctx, payload) => {
    // Validate, then re-broadcast via the server's publish so every
    // subscriber (including the sender) sees the message.
    const msg = parseChatMessage(payload);
    await server.publish(ctx.channel, {
      from: (ctx.ws.data as { userId: string }).userId,
      text: msg.text,
      at: Date.now(),
    });
  },
});
```

On the client, publishing requires an active subscription to the same
channel — the `pub` inherits the authorization decision made at
subscribe time, so a publish without a prior `subscribe()` is rejected
with `NOT_SUBSCRIBED`:

```ts
import { Client } from '@tundralibs/rpc';

const client = new Client({ url: 'ws://localhost:8080' });
const render = (_msg: unknown) => {};

// Subscribe first, then publish to the same channel.
await client.subscribe('chat:room1', (msg) => render(msg));
await client.publish('chat:room1', { text: 'hi' });
```

When a channel doesn't have `onPublish`, client `pub` frames are
refused with a `PUBLISH_REFUSED` error.

#### When to use a command instead of `onPublish`

`onPublish` is fire-and-forget by design — the handler doesn't see
the request frame's `id` and the server's ack carries no `data`.
That's intentional: clients use `pub` when they want to push and
move on.

**If you need request/response with custom ack data** (delivered-at
timestamp, generated message ID, validation result, anything tied
to the specific publish call), use a **command** instead. Commands
already give you `ctx.id`, schema validation, structured ack via
return value, custom error codes via thrown errors:

```ts
import { Server } from '@tundralibs/rpc';

type Conn = { userId: string };

const server = new Server<Conn>();
const ChatMessageSchema = {
  parse: (input: unknown) => input as { channel: string; message: string },
};
const canSendTo = (_userId: string, _channel: string): boolean => true;

server.command(
  'publishChat',
  (input) => ChatMessageSchema.parse(input),
  async (ctx) => {
    if (!canSendTo(ctx.ws.data.userId, ctx.payload.channel)) {
      throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
    }
    await server.publish(ctx.payload.channel, {
      from: ctx.ws.data.userId,
      text: ctx.payload.message,
    });
    return { delivered: true, ts: Date.now() };
  },
);
```

Client sends a `cmd` frame, gets a typed `result` back with the same
`id`. Reach for `pub` when fire-and-forget is what you actually want.

### Custom pub/sub adapter (Redis sketch)

The default `MemoryPubSubAdapter` is in-process only. For broadcast
across multiple node instances, write an adapter against the same
`PubSubAdapter` interface and pass it to the server:

```ts
import {
  type AdapterCapabilities,
  PubSubAdapter,
  Server,
  type Subscription,
} from '@tundralibs/rpc';

// The surface your Redis client of choice has to provide — `cacher`
// already speaks Redis, or use a direct driver.
declare class RedisClient {
  constructor(opts: { url: string });
  on(event: 'message', cb: (topic: string, raw: string) => void): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  publish(topic: string, payload: string): Promise<void>;
  quit(): Promise<void>;
}

class RedisPubSubAdapter extends PubSubAdapter {
  override readonly capabilities: AdapterCapabilities = {
    patternSubscribe: true,
    presence: false,
    replay: false,
    guaranteedOrder: true,
    guaranteedDelivery: false, // Redis pub/sub is at-most-once
    crossProcess: true,
    backpressureVisibility: false,
  };

  // Two connections: a Redis connection in subscribe mode can't issue
  // normal commands, so PUBLISH needs its own.
  private __pub: RedisClient;
  private __sub: RedisClient;
  private __handlers = new Map<string, Set<(data: unknown) => void>>();
  private __closed = false;

  constructor(opts: { url: string }) {
    super();
    this.__pub = new RedisClient(opts);
    this.__sub = new RedisClient(opts);
    this.__sub.on('message', (topic, raw) => {
      const handlers = this.__handlers.get(topic);
      if (!handlers) return;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return; // malformed — drop
      }
      // One throwing subscriber must not stop the rest of the fan-out.
      for (const fn of [...handlers]) {
        try {
          fn(data);
        } catch { /* swallow */ }
      }
    });
  }

  override subscribe(
    topic: string,
    handler: (data: unknown) => void,
  ): Subscription {
    if (this.__closed) throw new Error('adapter closed');
    let set = this.__handlers.get(topic);
    if (!set) {
      set = new Set();
      this.__handlers.set(topic, set);
      this.__sub.subscribe(topic); // SUBSCRIBE on the first local handler
    }
    set.add(handler);
    return {
      unsubscribe: () => {
        const current = this.__handlers.get(topic);
        if (!current) return;
        current.delete(handler); // idempotent
        if (current.size === 0) {
          this.__handlers.delete(topic);
          this.__sub.unsubscribe(topic); // UNSUBSCRIBE on the last one
        }
      },
    };
  }

  override async publish(topic: string, data: unknown): Promise<void> {
    if (this.__closed) return; // publish after close must not deliver
    await this.__pub.publish(topic, JSON.stringify(data));
  }

  override async close(): Promise<void> {
    if (this.__closed) return; // idempotent
    this.__closed = true;
    this.__handlers.clear();
    await Promise.all([this.__sub.quit(), this.__pub.quit()]);
  }
}

const server = new Server({
  pubsub: new RedisPubSubAdapter({ url: 'redis://localhost:6379' }),
});
```

Full adapter contract and capability flags: [Rpc-PubSub](docs/Rpc-PubSub.md).

## Error codes

The framework uses a small fixed set of error codes for protocol-level
issues; user code can throw with custom `.code` to route through the
same channel.

| Code              | Sent by  | Meaning                                                                                   |
| ----------------- | -------- | ----------------------------------------------------------------------------------------- |
| `BAD_FORMAT`      | server   | Malformed frame (invalid JSON, missing fields, unknown type)                              |
| `FRAME_TOO_LARGE` | server   | Incoming frame exceeded `maxFrameSize` (rejected before decoding)                         |
| `UNKNOWN_COMMAND` | server   | `cmd` frame referenced a command that wasn't registered                                   |
| `UNKNOWN_CHANNEL` | server   | `sub`/`pub` frame referenced an unregistered channel                                      |
| `VALIDATION`      | server   | Validator threw. The thrown error's `.message` is forwarded                               |
| `FORBIDDEN`       | server   | Channel `authorize` returned `false`                                                      |
| `AUTHZ_ERROR`     | server   | Channel `authorize` itself threw                                                          |
| `PUBLISH_REFUSED` | server   | Client tried to publish on a channel without `onPublish`                                  |
| `NOT_SUBSCRIBED`  | server   | Client sent a `pub` frame for a channel it is not currently subscribed to                 |
| `PUBLISH_ERROR`   | server   | `onPublish` handler threw                                                                 |
| `HANDLER_ERROR`   | server   | Command handler threw without a custom `.code`                                            |
| _custom_          | userland | Throw `Object.assign(new Error(msg), { code: 'YOUR_CODE' })` from a handler or middleware |

A thrown error may also carry a `data` property. It rides along on the
`result` frame's `error` object and reaches the caller as `.data` on
the rejection, so a failure can return structure rather than only a
string:

```ts
import { Client, Server } from '@tundralibs/rpc';

const server = new Server();
server.command('createUser', undefined, () => {
  throw Object.assign(new Error('invalid user'), {
    code: 'VALIDATION',
    data: { fields: { email: 'must be an email address' } },
  });
});
await server.listen({ port: 8080, hostname: '127.0.0.1' });

const client = new Client({ url: 'ws://127.0.0.1:8080' });
await client.connect();

try {
  await client.command('createUser', { email: 'nope' });
} catch (err) {
  const { code, data } = err as Error & { code?: string; data?: unknown };
  console.error(code, data); // 'VALIDATION' { fields: { … } }
}

await client.close();
await server.close();
```

`error.data` is sent verbatim to the caller — keep internals out of it.

Three more codes are raised **client-side**, with no wire frame behind
them, when a `command()` cannot be completed: `REQUEST_TIMEOUT` (no
`result` arrived within `defaultTimeoutMs`), `CONNECTION_LOST` (the
socket dropped with the call in flight) and `CLOSED` (`client.close()`
was called with the call in flight).

Every failure that arrives from the server attaches a `.code` property
to the rejection — both the `result` frame path above and a rejection
caused by a correlated out-of-band `error` frame (e.g. `BAD_FORMAT`
for a malformed frame whose id the server could recover). Only the
`result` path can also carry `.data`; the `error` frame has no field
for it.

The three client-side codes above are the exception: they have no wire
frame behind them and carry their code in the `Error`'s `message`
only, so branch on `err.message` for those.

## Runtime support

Pure JS on top of `@tundralibs/compat/websocket` — this package inherits whatever
that primitive supports. Today that means:

- **Bun**: native WebSocket
- **Deno**: native WebSocket via `Deno.upgradeWebSocket()`
- **Node**: WebSocket via the `ws` npm package

`Server` itself has no runtime branches.

## Related Documentation

- [Wire Protocol Reference](docs/Rpc-Protocol.md) — frame
  shapes, field validation, and codec error modes
- [Middleware Patterns](docs/Rpc-Middleware.md) — auth,
  rate-limiting, timing, error-routing, heartbeat recipes
- [Pub/Sub Adapters](docs/Rpc-PubSub.md) — adapter contract,
  capability flags, in-memory implementation, Redis sketch,
  conformance test harness
- [Extending](docs/Rpc-Extending.md) — the override surface,
  pattern subscribe via subclass, custom frame inspection
- [Tracing middleware](../tracer/docs/Tracer-Recipes.md#radrouter--rpc) —
  ready-made `@tundralibs/tracer` middleware for RPC's generic chain
  (a span per message, parented from inbound `traceparent`)
- [Examples](examples/) — runnable demos
- [`@tundralibs/compat/websocket`](../compat/websocket/Compat-WebSocket.md) —
  the underlying middleware-aware WebSocket primitive this package is built on

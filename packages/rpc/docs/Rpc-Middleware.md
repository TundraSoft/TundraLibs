# Middleware

Koa-style middleware composes around every command. Use it for
auth, rate limits, timing, logging, request-scoped state, and error
routing — anything that crosscuts your handlers.

> `Server` middleware is **per-command** — it sees `ctx.cmd`, `ctx.payload`,
> `ctx.id`. For lower-level message middleware (sees raw decoded
> messages, not `Server` commands), use the
> [`@tundralibs/compat/websocket`](../../compat/websocket/Compat-WebSocket.md)
> primitive directly.

## Table of Contents

- [Shape](#shape)
- [Composition Order](#composition-order)
- [Per-Request State](#per-request-state)
- [Short-Circuiting](#short-circuiting)
- [Error Routing](#error-routing)
- [Recipe: Auth](#recipe-auth)
- [Recipe: Rate Limiting](#recipe-rate-limiting)
- [Recipe: Timing + Logging](#recipe-timing--logging)
- [Recipe: Per-Command Allowlist](#recipe-per-command-allowlist)
- [Recipe: Heartbeat / Liveness](#recipe-heartbeat--liveness)

## Shape

```ts
import type { Middleware } from '@tundralibs/rpc';

type MyConn = { userId: string };

const mw: Middleware<MyConn> = async (ctx, next) => {
  // before
  await next();
  // after
};
```

The context is identical to what command handlers receive (typed `T`,
`payload`, `state`, `cmd`, `id`, `ws`) — meaning middleware can read
and mutate any of it before the handler runs.

## Composition Order

Middleware runs in registration order, with each one wrapping the rest
of the chain in `next()`:

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

server.use(async (_, next) => {
  console.log('1: before');
  await next();
  console.log('1: after');
});
server.use(async (_, next) => {
  console.log('2: before');
  await next();
  console.log('2: after');
});
server.command('cmd', undefined, () => console.log('handler'));
```

```
1: before
2: before
handler
2: after
1: after
```

Outer middleware sees the inner middleware's after-effects in
`next()`'s rejection (or after it resolves). Use `try { await next();
} finally { … }` to run after every command regardless of success.

## Per-Request State

`ctx.state` is a fresh `Record<string, unknown>` for every command.
Middleware writes to it; later middleware and the handler read.

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

server.use(async (ctx, next) => {
  ctx.state.startedAt = performance.now();
  await next();
});

server.use(async (ctx, next) => {
  await next();
  const elapsed = performance.now() - (ctx.state.startedAt as number);
  console.log(`${ctx.cmd} took ${elapsed.toFixed(1)}ms`);
});

server.command('echo', undefined, (ctx) => {
  // ctx.state.startedAt is also visible here
  return ctx.payload;
});
```

`ctx.state` is **not** typed — TypeScript can't track what each
middleware writes. Cast at read sites or wrap with helper functions
that assert the shape.

## Short-Circuiting

A middleware that doesn't call `next()` skips both the handler and
any downstream middleware. The framework still acks the request with
`ok: true` (data: `undefined`) so the client isn't left waiting:

```ts
import { Server } from '@tundralibs/rpc';
import type { ServerWebSocket } from '@tundralibs/compat/webserver';

const server = new Server();
const rateLimited = (_ws: ServerWebSocket<unknown>) => false;

server.use(async (ctx, _next) => {
  if (rateLimited(ctx.ws)) {
    // handler never runs; client gets { ok: true, data: undefined }
    return;
  }
  await _next(); // (rename `_next` → `next` once you actually call it)
});
```

If you want the short-circuit to look like a failure to the client,
throw instead — see error routing.

## Error Routing

Throws from middleware (or the handler) become `result` frames with
`ok: false`. Custom `.code` propagates; otherwise the framework uses
`HANDLER_ERROR`.

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

class AuthError extends Error {
  code = 'UNAUTHENTICATED';
  constructor() {
    super('not authenticated');
  }
}

server.use(async (ctx, next) => {
  if (!ctx.ws.data) throw new AuthError();
  await next();
});
```

Client sees:

```jsonc
{
  "id": "1",
  "type": "result",
  "ok": false,
  "error": { "code": "UNAUTHENTICATED", "message": "not authenticated" }
}
```

Wrap `await next()` in `try / catch` if you want middleware to log /
swallow / transform errors before they reach the client:

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();
const metrics = { commandErrors: { inc: (_labels: { cmd: string }) => {} } };

server.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    metrics.commandErrors.inc({ cmd: ctx.cmd });
    throw err; // re-throw so the framework sends the result error
  }
});
```

## Recipe: Auth

Set typed connection state in the upgrade hook, gate commands in
middleware:

```ts
import { Server } from '@tundralibs/rpc';

type Conn = { userId: string; roles: Set<string> };

const verifyToken = (_token: string | null): string | undefined => undefined;
const rolesFor = (_userId: string): Set<string> => new Set();
const requiredRolesFor = (_cmd: string): string[] => [];

const server = new Server<Conn>({
  upgrade: (req) => {
    const userId = verifyToken(req.headers.get('authorization'));
    if (!userId) return false;
    return { data: { userId, roles: rolesFor(userId) } };
  },
});

// Reject commands the user isn't allowed to run
server.use(async (ctx, next) => {
  const required = requiredRolesFor(ctx.cmd);
  const has = ctx.ws.data.roles;
  if (required.some((r) => !has.has(r))) {
    const err = new Error(`requires role(s): ${required.join(', ')}`) as
      & Error
      & { code: string };
    err.code = 'FORBIDDEN';
    throw err;
  }
  await next();
});
```

## Recipe: Rate Limiting

Per-connection token bucket in `ws.data` (or a separate WeakMap):

```ts
import { Server } from '@tundralibs/rpc';

type Conn = { tokens: number; refillAt: number };

const server = new Server();

server.use(async (ctx, next) => {
  const now = Date.now();
  const conn = ctx.ws.data as Conn;
  // Refill: 10 tokens per second
  if (now > conn.refillAt) {
    conn.tokens = Math.min(
      10,
      conn.tokens + Math.floor((now - conn.refillAt) / 100),
    );
    conn.refillAt = now;
  }
  if (conn.tokens <= 0) {
    const err = new Error('rate limited') as Error & { code: string };
    err.code = 'RATE_LIMITED';
    throw err;
  }
  conn.tokens--;
  await next();
});
```

## Recipe: Timing + Logging

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

server.use(async (ctx, next) => {
  const t0 = performance.now();
  let outcome: 'ok' | 'fail' = 'ok';
  try {
    await next();
  } catch (err) {
    outcome = 'fail';
    throw err;
  } finally {
    const elapsed = performance.now() - t0;
    console.log(`${ctx.cmd} ${outcome} ${elapsed.toFixed(1)}ms`);
  }
});
```

Run this middleware **first** (registered before others) so its
`finally` block sees the total elapsed time including downstream
middleware and the handler.

## Recipe: Per-Command Allowlist

Middleware sees every command. Use `ctx.cmd` to scope behavior:

```ts
import { Server } from '@tundralibs/rpc';

const server = new Server();

const PUBLIC_COMMANDS = new Set(['ping', 'time']);

server.use(async (ctx, next) => {
  if (PUBLIC_COMMANDS.has(ctx.cmd)) {
    await next(); // skip auth for these
    return;
  }
  // … run auth checks for everything else
  await next();
});
```

If you find yourself maintaining many of these branches, that's a
sign the middleware should be split — register the auth one only on
private commands by wrapping them in a higher-order helper:

```ts
import { Server } from '@tundralibs/rpc';
import type { CommandHandler } from '@tundralibs/rpc';

type Conn = { userId: string };

const server = new Server<Conn>();
const PostSchema = (input: unknown) => input as { title: string };

const requireAuth =
  <P, R>(handler: CommandHandler<Conn, P, R>): CommandHandler<Conn, P, R> =>
  async (ctx) => {
    if (!ctx.ws.data?.userId) {
      const err = new Error('unauthenticated') as Error & { code: string };
      err.code = 'UNAUTHENTICATED';
      throw err;
    }
    return await handler(ctx);
  };

server.command('ping', undefined, () => 'pong');
server.command('createPost', PostSchema, requireAuth(async (ctx) => {/* … */}));
```

## Recipe: Heartbeat / Liveness

`Server` deliberately doesn't ship a built-in heartbeat. **Application-level
heartbeat is a 10-line userland recipe** because `Server` already gives you
everything you need: command handlers, `ctx.ws.data` for per-connection
state, `server.connections` for iteration, and `ws.close()` for
disconnecting stale sockets.

> Why not protocol-level (`ws.ping()`)? Deno's WebSocket consumes
> ping/pong frames internally and doesn't expose them — there's no
> way to observe pongs server-side. App-level frames work uniformly
> across Bun, Deno, Node, and the browser.

### Client-driven (recommended)

The client pings the server on a timer; the server tracks last-seen
and sweeps stale connections.

```ts
import { Server } from '@tundralibs/rpc';

type Conn = { lastSeen?: number };

const server = new Server<Conn>({
  upgrade: () => ({ data: { lastSeen: Date.now() } }),
});

// Touch lastSeen on every command (including the heartbeat itself)
server.use(async (ctx, next) => {
  ctx.ws.data.lastSeen = Date.now();
  await next();
});

// Heartbeat command — clients send this every ~30s
server.command('heartbeat', undefined, () => ({ ts: Date.now() }));

// Sweeper: close connections idle for >60s
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const ws of server.connections) {
    if ((ws.data.lastSeen ?? 0) < cutoff) {
      ws.close(1011, 'idle');
    }
  }
}, 10_000);
```

The middleware-touches-`lastSeen` trick means _any_ incoming traffic
counts as liveness — clients in active use don't need to send extra
heartbeats.

### Server-driven

If you need to detect dead clients without relying on them to ping
first, push from the server using a system channel and have clients
echo back via a `pong` command.

```ts
import { Server } from '@tundralibs/rpc';

type Conn = { lastPong?: number };

const server = new Server<Conn>({
  upgrade: () => ({ data: { lastPong: Date.now() } }),
});

server.channel('__heartbeat', {});

server.command('pong', undefined, (ctx) => {
  ctx.ws.data.lastPong = Date.now();
});

// Auto-subscribe every connection to the heartbeat channel.
// (Track subscriptions yourself, or expose a "join" command clients call on connect.)

setInterval(() => {
  server.publish('__heartbeat', { ts: Date.now() });

  const cutoff = Date.now() - 90_000;
  for (const ws of server.connections) {
    if ((ws.data.lastPong ?? 0) < cutoff) {
      ws.close(1011, 'no pong');
    }
  }
}, 30_000);
```

The client SDK listens for `msg` frames on `__heartbeat` and replies
with `cmd: 'pong'`.

### Operational notes (apply to any `server.connections` use)

`server.connections` is server-side only — clients can't reach it via the
wire. The connection references were already available inside any
handler via `ctx.ws`; this getter just lets you reach them from
outside (sweepers, broadcast filters, presence queries). No new
attack surface, but a few things worth keeping in mind whenever you
iterate:

- **Don't log `ws.data` carelessly.** Per-connection state often
  carries auth tokens, session IDs, or PII. Make sure debug logs,
  metrics, and error reports don't dump it wholesale.
- **Mass-action capability.** Code holding the `server` in scope can send to
  or close every connection. Keep the `server` reference out of any
  module that handles untrusted input as code (eval-style, not as
  data).
- **Filter for cross-tenant safety.** If one `Server` serves multiple
  tenants, the sweeper sees all of them — filter on
  `ws.data.tenantId` (or equivalent) inside the loop.
- **Don't `await` per connection without batching.** `await
  somethingAsync(ws)` inside the loop serializes fan-out across
  every connection. Use `Promise.all([...].map(...))` if you need
  parallelism.
- **`ws.send` is sync and may throw silently.** A connection that
  closed mid-iteration is still in the snapshot; calling `send()`
  on it is a no-op. Don't rely on per-connection success indicators
  unless you check `ws.readyState` first.

---

[← Back to RPC](../README.md)

# Middleware

Koa-style middleware composes around every incoming message. Use it
for logging, timing, rate limits, request-scoped state, error
routing — anything that crosscuts your `onMessage` handler.

> This page covers **message-level** middleware on the
> `WebSocketServer` primitive. For **command-level** middleware
> (sees `ctx.cmd`, `ctx.payload`, `ctx.id`), reach for
> [`@tundralibs/rpc`](../../../rpc/docs/Rpc-Middleware.md).

## Table of Contents

- [Shape](#shape)
- [Composition Order](#composition-order)
- [Per-Message State](#per-message-state)
- [Short-Circuiting](#short-circuiting)
- [Error Handling](#error-handling)
- [Recipe: Timing + Logging](#recipe-timing--logging)
- [Recipe: Rate Limiting](#recipe-rate-limiting)
- [Recipe: Conditional Drop](#recipe-conditional-drop)

## Shape

```ts
import type { Middleware } from '@tundralibs/compat/websocket';

const mw: Middleware<MyConn> = async (ctx, next) => {
  // before
  await next();
  // after
};
```

`ctx` carries:

- `ctx.ws` — the connection (`ServerWebSocket<T>`)
- `ctx.message` — decoded message (`M`, default `string`)
- `ctx.state` — fresh `Record<string, unknown>` per message

## Composition Order

Middleware runs in registration order, with each one wrapping the rest
of the chain in `next()`:

```ts
wss.use(async (_, next) => {
  console.log('1: before');
  await next();
  console.log('1: after');
});
wss.use(async (_, next) => {
  console.log('2: before');
  await next();
  console.log('2: after');
});
wss.onMessage(() => {
  console.log('handler');
});
```

```
1: before
2: before
handler
2: after
1: after
```

Outer middleware sees the inner middleware's after-effects when
`next()` resolves (or rejects). Use `try { await next(); } finally
{ … }` to run cleanup regardless of success.

## Per-Message State

`ctx.state` is a fresh `Record<string, unknown>` for every incoming
message. Middleware writes to it; later middleware and the
`onMessage` handler read.

```ts
wss.use(async (ctx, next) => {
  ctx.state.startedAt = performance.now();
  await next();
});

wss.use(async (ctx, next) => {
  await next();
  const elapsed = performance.now() - (ctx.state.startedAt as number);
  console.log(`message took ${elapsed.toFixed(1)}ms`);
});
```

`ctx.state` is **not** typed — TypeScript can't track what each
middleware writes. Cast at read sites or wrap with helper functions
that assert the shape.

## Short-Circuiting

A middleware that doesn't call `next()` skips both the `onMessage`
handler and any downstream middleware. The framework does **not**
auto-ack — there is no protocol-level response on the primitive,
so a short-circuited message is simply not processed.

```ts
wss.use(async (ctx, _next) => {
  if (rateLimited(ctx.ws)) {
    return; // drop
  }
  await _next();
});
```

If you want short-circuiting to send something back to the client,
do it explicitly:

```ts
wss.use(async (ctx, next) => {
  if (rateLimited(ctx.ws)) {
    ctx.ws.send('rate limited');
    return;
  }
  await next();
});
```

## Error Handling

Throws from middleware (or the `onMessage` handler) propagate out the
chain and land in the configured `onError` handler. When no handler
is set, the throw is swallowed to keep the connection alive.

```ts
wss.onError((err, ws) => {
  console.error(`connection ${ws.remoteAddress} crashed:`, err);
});

wss.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    metrics.errors.inc();
    throw err; // re-throw so onError still fires
  }
});
```

This primitive deliberately doesn't have a "send error to client" path
— that's a wire-protocol concern. If you need that, either add it
manually (`ctx.ws.send(...)`), or use
[`@tundralibs/rpc`](../../../rpc/README.md), which has a structured error
frame.

## Recipe: Timing + Logging

```ts
wss.use(async (ctx, next) => {
  const t0 = performance.now();
  let outcome: 'ok' | 'fail' = 'ok';
  try {
    await next();
  } catch (err) {
    outcome = 'fail';
    throw err;
  } finally {
    console.log(`msg ${outcome} ${(performance.now() - t0).toFixed(1)}ms`);
  }
});
```

Run this middleware **first** (registered before others) so its
`finally` block sees the total elapsed time including downstream
middleware and the handler.

## Recipe: Rate Limiting

Per-connection token bucket using `ws.data` as the carrier:

```ts
type Conn = { tokens: number; refillAt: number };

const wss = new WebSocketServer<Conn>({
  upgrade: () => ({ data: { tokens: 10, refillAt: Date.now() } }),
});

wss.use(async (ctx, next) => {
  const now = Date.now();
  const conn = ctx.ws.data;
  // Refill: 10 tokens per second
  if (now > conn.refillAt) {
    conn.tokens = Math.min(
      10,
      conn.tokens + Math.floor((now - conn.refillAt) / 100),
    );
    conn.refillAt = now;
  }
  if (conn.tokens <= 0) {
    ctx.ws.send('rate limited');
    return;
  }
  conn.tokens--;
  await next();
});
```

## Recipe: Conditional Drop

Inspect the message before deciding whether to dispatch:

```ts
wss.use(async (ctx, next) => {
  if (typeof ctx.message === 'string' && ctx.message.startsWith('IGNORE:')) {
    return; // drop
  }
  await next();
});
```

For per-content branching beyond a couple of patterns, you're probably
better served by Hub's command router — register one command per
action and let the router dispatch.

---

[← Back to Compat-WebSocket](../Compat-WebSocket.md)

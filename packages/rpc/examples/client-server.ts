/**
 * @fileoverview Client + Server round trip — every core RPC idea in one
 * runnable process, no subclassing required: command/response with
 * payload validation, Koa-style middleware (timing + auth gate),
 * channel subscribe/publish (both server-initiated push and a client
 * `pub` via `onPublish`), custom error codes with structured `.data`,
 * and inspecting the configured pub/sub adapter's capabilities.
 *
 * `pattern-subscribe.ts` (sibling file) covers glob-style channel
 * patterns via subclassing `Server`; this file covers everything else
 * — the parts of the framework you reach for before you ever need to
 * subclass anything.
 *
 * Run:
 *   deno run --allow-net packages/rpc/examples/client-server.ts
 *   bun run packages/rpc/examples/client-server.ts
 *   node --import tsx packages/rpc/examples/client-server.ts
 *
 * @module
 */

import { Client, MemoryPubSubAdapter, Server } from '@tundralibs/rpc';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}\n${JSON.stringify(value, null, 2)}`);

type Conn = { userId: string };

// ---------------------------------------------------------------------------
// Server: commands, middleware, a channel with client-publish enabled.
// ---------------------------------------------------------------------------

const server = new Server<Conn>({
  pubsub: new MemoryPubSubAdapter(), // explicit here; same adapter as the default
  upgrade: (req) => {
    const userId = new URL(req.url).searchParams.get('user') ?? 'anon';
    return { data: { userId } };
  },
});

// Middleware 1 (outermost): times every command, keyed by name. `finally`
// (not a bare `await next()`) so a throwing handler — riskyOp below —
// still gets timed instead of silently skipping this line.
const timings: Record<string, number> = {};
server.use(async (ctx, next) => {
  const t0 = performance.now();
  try {
    await next();
  } finally {
    timings[ctx.cmd] = Math.round(performance.now() - t0);
  }
});

// Middleware 2: auth gate — every command except `whoami` requires a
// resolved (non-anonymous) userId from the upgrade hook.
server.use(async (ctx, next) => {
  if (ctx.cmd !== 'whoami' && ctx.ws.data.userId === 'anon') {
    throw Object.assign(new Error('not authenticated'), {
      code: 'UNAUTHENTICATED',
    });
  }
  await next();
});

server.command(
  'whoami',
  undefined,
  (ctx) => ({ userId: ctx.ws.data.userId }),
);

// A validated command — the schema throws on bad input, which the
// framework reports back to the client as a VALIDATION error.
server.command(
  'createUser',
  (input: unknown) => {
    const name = (input as { name?: unknown } | undefined)?.name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('name is required');
    }
    return { name };
  },
  (ctx) => ({ id: 'u-1', name: ctx.payload.name }),
);

// A handler that fails with a custom error code and structured `.data`
// — both ride the `result` frame's `error` object back to the client.
server.command('riskyOp', undefined, () => {
  throw Object.assign(new Error('insufficient balance'), {
    code: 'INSUFFICIENT_FUNDS',
    data: { needed: 100, available: 40 },
  });
});

// A channel clients can both subscribe to AND publish into — `onPublish`
// re-broadcasts through `server.publish` so every subscriber (including
// the sender) sees the message.
server.channel('room:general', {
  onPublish: async (ctx, payload) => {
    const { text } = payload as { text: string };
    await server.publish('room:general', { from: ctx.ws.data.userId, text });
  },
});

const PORT = 8089;
await server.listen({ port: PORT, hostname: '127.0.0.1' });

// ---------------------------------------------------------------------------
// Client: connect, invoke commands, subscribe, publish.
// ---------------------------------------------------------------------------

const client = new Client({ url: `ws://127.0.0.1:${PORT}/?user=ada` });
await client.connect();

say(
  '1. command — whoami (public, no auth needed)',
  await client.command(
    'whoami',
  ),
);

say(
  '2. command — validated payload (success)',
  await client.command('createUser', { name: 'Ada' }),
);

try {
  await client.command('createUser', {});
} catch (err) {
  const e = err as Error & { code?: string };
  say('3. command — validated payload (VALIDATION failure)', {
    code: e.code,
    message: e.message,
  });
}

try {
  await client.command('riskyOp');
} catch (err) {
  const e = err as Error & { code?: string; data?: unknown };
  say('4. command — custom error code + structured data', {
    code: e.code,
    data: e.data,
  });
}

const received: unknown[] = [];
const sub = await client.subscribe('room:general', (data) => {
  received.push(data);
});
say('5. subscribe — server ack', { channel: sub.channel });

await server.publish('room:general', { from: 'system', text: 'welcome' });
await client.publish('room:general', { text: 'hi from ada' });
// MemoryPubSubAdapter fans out synchronously, but each `msg` still has to
// make a real WebSocket round trip to the client — give the event loop a
// moment before reading `received`.
await new Promise((resolve) => setTimeout(resolve, 50));
say(
  '6. pub/sub — server push + client publish via onPublish',
  received,
);

say('7. middleware — per-command timing captured by the outer middleware', {
  commandsTimed: Object.keys(timings),
});

say("8. adapter — the configured PubSubAdapter's capabilities", {
  crossProcess: server.adapter.capabilities.crossProcess,
  guaranteedOrder: server.adapter.capabilities.guaranteedOrder,
});

await sub.unsubscribe();
await client.close();
await server.close();

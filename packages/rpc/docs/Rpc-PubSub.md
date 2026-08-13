# Pub/Sub Adapters

`Server` delegates topic broadcast to a `PubSubAdapter`.
The default adapter ships in core (in-process); cross-process
broadcast is handled by user-supplied adapters that conform to the
same contract.

## Table of Contents

- [The Contract](#the-contract)
- [Capabilities](#capabilities)
- [Inspecting capabilities at runtime](#inspecting-capabilities-at-runtime)
- [`MemoryPubSubAdapter`](#memorypubsubadapter)
- [Custom Adapters](#custom-adapters)
- [Sketch: Redis Adapter](#sketch-redis-adapter)
- [Testing Your Adapter](#testing-your-adapter)
- [When to Reach for Cross-Process](#when-to-reach-for-cross-process)
- [Pitfalls](#pitfalls)

## The Contract

```ts
import type { AdapterCapabilities } from '@tundralibs/rpc';

abstract class PubSubAdapter {
  abstract subscribe(
    topic: string,
    handler: (data: unknown) => void,
  ): Subscription;

  abstract publish(topic: string, data: unknown): Promise<void>;

  abstract close(): Promise<void>;

  abstract readonly capabilities: AdapterCapabilities;
}

type Subscription = { unsubscribe(): void };
```

Three required operations and one capability declaration. That's it.
Concrete implementations enforce delivery semantics, transport, and
durability — the framework doesn't care, as long as the contract is
honored.

### Required Behavior

- **`subscribe(topic, handler)`** — register a handler for a topic.
  Returns a `Subscription` whose `.unsubscribe()` removes this
  specific handler. Multiple subscribers per topic must be supported.
- **`publish(topic, data)`** — broadcast `data` to every current
  subscriber of `topic`. Resolves once the adapter has accepted the
  message (delivery semantics depend on `capabilities.guaranteedDelivery`).
- **`close()`** — tear down the adapter. After `close()`, subscribe
  must throw or no-op; publish must not deliver. Idempotent.

The adapter doesn't know about WebSocket connections — it only knows
topics and handlers. The framework layer wires `Server`'s
internal subscription tracking onto the adapter so that closing a
WebSocket connection unsubscribes that connection's handlers
automatically.

## Capabilities

```ts
interface AdapterCapabilities {
  patternSubscribe: boolean; // 'chat:*' wildcards
  presence: boolean; // list active subscribers
  replay: boolean; // subscribe to past messages
  guaranteedOrder: boolean; // FIFO per topic
  guaranteedDelivery: boolean; // at-least-once
  crossProcess: boolean; // multi-process broadcast
  backpressureVisibility: boolean; // outbound queue size visible
}
```

Capabilities declare what the adapter does **beyond** the required
minimum.

> **Today they are adapter self-description, not framework-enforced.**
> Hub does not currently gate any feature on these flags — it just
> calls `subscribe` / `publish` / `close`. The flags exist for _your_
> code to inspect at startup (see below). When Hub gains pattern
> subscribe, presence, or replay features, the corresponding flags
> will become enforced — adapters declaring `false` will refuse to
> register the dependent features. Until then, treat the matrix as
> documentation about what each adapter is willing to do.

## Inspecting capabilities at runtime

`server.adapter` returns the active `PubSubAdapter`; `.capabilities`
gives you the matrix. Use it for sanity-checks at boot:

```ts
import { MemoryPubSubAdapter, Server } from '@tundralibs/rpc';

const server = new Server({ pubsub: new MemoryPubSubAdapter() });

// Warn if you've configured a single-process adapter for a
// multi-instance deployment.
if (
  process.env.CLUSTER_MODE === 'on' && !server.adapter.capabilities.crossProcess
) {
  console.warn(
    'Hub: in-process adapter configured but CLUSTER_MODE=on — ' +
      'subscribers on other instances will not receive publishes.',
  );
}

// Or fail fast if delivery guarantees are required.
if (!server.adapter.capabilities.guaranteedDelivery) {
  throw new Error(
    'this deployment requires at-least-once delivery; pick a ' +
      'different adapter (Redis Streams, Kafka, NATS JetStream, ...)',
  );
}
```

Custom adapters that mis-declare are user error — Hub trusts what the
adapter says. If you write a Redis pub/sub adapter and set
`guaranteedDelivery: true`, Hub won't catch the lie; your downstream
code will.

## `MemoryPubSubAdapter`

The default. In-process, synchronous fan-out, no persistence, no
replay. Backed by a `Map<topic, Set<handler>>`.

```ts
import { MemoryPubSubAdapter, Server } from '@tundralibs/rpc';

const server = new Server({
  pubsub: new MemoryPubSubAdapter(), // explicit; same as the default
});
```

### What it gives you

- `guaranteedOrder`, `guaranteedDelivery` — yes, trivially (direct
  function call to every subscriber).
- Sub-microsecond fan-out — no serialization, no I/O.

### What it doesn't

- `crossProcess`: false. Two `Server` instances on different
  Node processes don't share subscribers.
- `replay`: false. New subscribers see only messages published after
  they subscribed.
- `presence`: false. The framework can track per-connection
  subscriptions itself, but the adapter doesn't expose a
  "who's subscribed?" query.

This is the right adapter for single-process deployments and tests.
Reach for a cross-process adapter only when you actually need it.

## Custom Adapters

Subclass `PubSubAdapter` and provide the four required members:

```ts
import {
  type AdapterCapabilities,
  PubSubAdapter,
  type Subscription,
} from '@tundralibs/rpc';

class MyAdapter extends PubSubAdapter {
  override readonly capabilities: AdapterCapabilities = {
    patternSubscribe: false,
    presence: false,
    replay: false,
    guaranteedOrder: true,
    guaranteedDelivery: false, // tune per backend
    crossProcess: true,
    backpressureVisibility: false,
  };

  override subscribe(
    topic: string,
    handler: (data: unknown) => void,
  ): Subscription {
    // Register handler; return cleanup function
    return { unsubscribe: () => {} };
  }

  override publish(topic: string, data: unknown): Promise<void> {
    // Send to all subscribers (possibly across processes)
    return Promise.resolve();
  }

  override async close(): Promise<void> {
    // Drain in-flight, disconnect transport
  }
}
```

Pass an instance into the server:

```ts
import { PubSubAdapter, Server } from '@tundralibs/rpc';

// The subclass defined in the block above.
declare const MyAdapter: new () => PubSubAdapter;

const server = new Server({ pubsub: new MyAdapter() });
```

## Sketch: Redis Adapter

Pseudocode — fill in your Redis client of choice (the `cacher` package
already speaks Redis, or use a direct driver).

```ts
import {
  type AdapterCapabilities,
  PubSubAdapter,
  type Subscription,
} from '@tundralibs/rpc';

// The surface your Redis client of choice has to provide.
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
    patternSubscribe: true, // PSUBSCRIBE
    presence: false,
    replay: false,
    guaranteedOrder: true,
    guaranteedDelivery: false, // Redis pub/sub is at-most-once
    crossProcess: true,
    backpressureVisibility: false,
  };

  // Two connections: one for publish (write), one for subscribe (read).
  // Redis subscribe-mode connections can't issue normal commands.
  __pub: RedisClient;
  __sub: RedisClient;
  __handlers = new Map<string, Set<(data: unknown) => void>>();
  __closed = false;

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
      this.__sub.subscribe(topic); // SUBSCRIBE only when first handler registers
    }
    set.add(handler);
    return {
      unsubscribe: () => {
        const s = this.__handlers.get(topic);
        if (!s) return;
        s.delete(handler);
        if (s.size === 0) {
          this.__handlers.delete(topic);
          this.__sub.unsubscribe(topic); // UNSUBSCRIBE when last handler leaves
        }
      },
    };
  }

  override async publish(topic: string, data: unknown): Promise<void> {
    if (this.__closed) return;
    await this.__pub.publish(topic, JSON.stringify(data));
  }

  override async close(): Promise<void> {
    this.__closed = true;
    this.__handlers.clear();
    await Promise.all([this.__sub.quit(), this.__pub.quit()]);
  }
}
```

### Notes

- **Two connections**: Redis blocks normal commands on a connection
  in subscribe mode. Use one for SUBSCRIBE, another for PUBLISH.
- **Local subscriber bookkeeping**: even with cross-process Redis,
  the adapter still tracks local handlers — only one Redis SUBSCRIBE
  per topic, and only when the first local handler registers.
- **JSON serialization is the adapter's choice**: the contract takes
  `unknown`. Adapters serialize as needed. For binary payloads,
  use msgpack / CBOR / etc. and document the choice.
- **At-most-once delivery**: Redis pub/sub doesn't persist. Messages
  published while a process is restarting are lost. If at-least-once
  matters, use Redis Streams or a different broker — adapter
  capabilities should reflect that.

## Testing Your Adapter

The contract above is enforced by an executable test harness shipped
with the package, not just prose. Any adapter — including the bundled
`MemoryPubSubAdapter` — can run the harness against itself and inherit
the same assertions.

It lives behind its own `@tundralibs/rpc/conformance` sub-path, and is
deliberately **not** re-exported from `@tundralibs/rpc` or
`@tundralibs/rpc/pubsub` — see [Why its own sub-path](#why-its-own-sub-path).

```ts
import { describe } from '@tundralibs/compat/test';
import { runAdapterConformance } from '@tundralibs/rpc/conformance';
import type { PubSubAdapter } from '@tundralibs/rpc';

// Your adapter: `import { MyRedisAdapter } from './MyRedisAdapter.ts';`
declare const MyRedisAdapter: new (opts: { url: string }) => PubSubAdapter;

describe('MyRedisAdapter', () => {
  runAdapterConformance(() => new MyRedisAdapter({ url: 'redis://...' }));

  // …adapter-specific tests below
});
```

`runAdapterConformance(factory, options?)` takes a factory that returns
a fresh adapter (sync or async — Redis-style connect is fine) and
registers one `it()` per contract clause inside the surrounding
`describe()`. Each test gets its own adapter instance; `close()` runs
in `afterEach`.

### What the harness asserts (universal)

1. `subscribe → publish` delivers data to the handler.
2. Fan-out: every subscriber on a topic sees every message.
3. Topic isolation: messages do not cross topics.
4. `unsubscribe()` stops further delivery to that handler.
5. `unsubscribe()` is idempotent.
6. A throwing subscriber does not prevent other subscribers from running.
7. Subscribers added after a `publish()` do not see prior messages
   (no implicit replay).
8. `publish()` after `close()` does not deliver to surviving
   subscribers.
9. `close()` is idempotent.

### Capability-gated

10. If `capabilities.guaranteedOrder === true`, publishing 1, 2, 3
    delivers as 1, 2, 3 to every subscriber.

Pattern subscribe, presence, replay, and backpressure are not exercised
yet — their assertions will land alongside framework-level support.

### Knobs

```ts
import { runAdapterConformance } from '@tundralibs/rpc/conformance';
import { MemoryPubSubAdapter } from '@tundralibs/rpc/pubsub';

const factory = () => new MemoryPubSubAdapter();

runAdapterConformance(factory, {
  deliveryTimeoutMs: 5_000, // default 1000; bump for slow transports
});
```

The harness polls for expected state with a deadline rather than
asserting immediately after `publish()`, so it works for synchronous
adapters (Memory) and asynchronous ones (Redis pub/sub, etc.). Negative
assertions ("message must not arrive") use a short fixed wait.

### What it doesn't cover

- **`crossProcess` broadcast.** Verifying that two adapter instances
  on different processes see each other's publishes requires an
  out-of-process integration test (spawn a worker, share a broker,
  assert delivery on both sides). The harness is single-process; run a
  separate test for that.
- **Adapter-specific behavior** (Redis reconnect, Kafka offset
  semantics, etc.). Add your own `it()` blocks inside the same
  `describe()`.

### Dogfooded

`MemoryPubSubAdapter` runs the same suite — its test file is a
`runAdapterConformance(() => new MemoryPubSubAdapter())` call plus a
small `describe('memory-specific')` block for behaviors that aren't
part of the universal contract (synchronous delivery, throw-on-
subscribe-after-close). Contract drift in the harness breaks
Memory's CI alongside any custom adapter's.

### Why its own sub-path

The harness imports `@tundralibs/compat/test`, which resolves
`bun:test` / `node:test` to whichever test framework the host runtime
provides. Those specifiers do not exist for browser- and edge-targeting
bundlers: with the harness re-exported from `@tundralibs/rpc`, a
Cloudflare Workers build fails outright with
`Could not resolve "bun:test"` — even for an app that only imports
`Client`. Parking it on `@tundralibs/rpc/conformance` keeps every
runtime barrel free of that edge, so `@tundralibs/rpc` and
`@tundralibs/rpc/pubsub` bundle cleanly for Workers, Deno Deploy, and
the browser with no `alias` shims.

The rule that follows: `runAdapterConformance` is imported from test
files only, and neither `mod.ts` nor `pubsub/mod.ts` may re-export it.

> **Implementation**: [`pubsub/conformance.ts`](../pubsub/conformance.ts),
> published as `@tundralibs/rpc/conformance`.

## When to Reach for Cross-Process

The in-memory adapter is a single point of broadcast — every client
connected to the same process sees every publish. Switch to a
cross-process adapter when:

- You're running multiple instances of the server behind a load
  balancer, and clients on different instances need to receive each
  other's messages.
- You're publishing from background workers (e.g. a job queue) that
  don't hold WebSocket connections themselves but need to fan out
  notifications.
- You need durability (Redis Streams, Kafka, NATS JetStream, …) —
  in-memory drops everything when the process restarts.

If your traffic fits in one process and surviving restarts isn't a
requirement, the default in-memory adapter is the right choice.
Don't reach for Redis prophylactically.

## Pitfalls

### Subscriber throws

The default adapter swallows subscriber exceptions to keep fan-out
going. Make sure your custom adapter does the same — one bad handler
shouldn't stop the others.

### Publish during close

Calling `publish()` after `close()` should not throw or block.
Resolve to nothing and let the caller move on.

### Adapter-level vs framework-level subscriptions

The adapter has no concept of "this handler belongs to WebSocket
connection X." That's framework-level state. When a connection
closes, `Server` walks its tracked subscriptions and calls
`.unsubscribe()` on each — the adapter doesn't need to do anything
clever. Don't conflate "topic has zero subscribers in the adapter"
with "no clients connected on this server."

### Pattern subscribe + presence

Both are useful but have outsized implementation costs in some
backends. Don't claim them in `capabilities` unless you actually
implement them — the framework checks at runtime and a false claim
manifests as silently dropped messages or empty presence lists. Real
test pressure helps catch this.

---

[← Back to RPC](../README.md)

# Extending

`Server`'s public API covers the common cases — commands, channels,
middleware, pub/sub adapters. For everything else, **subclass and
override**. `Server` is designed to be extended.

## The override surface

`Server` follows a soft-private convention:

- `public` — the API surface (e.g. `command()`, `channel()`, `use()`,
  `publish()`, `connections`, `adapter`). Stable across minor
  versions. Document the contract, deprecate before removing.
- `_single_underscore` (TypeScript `protected`) — the extension seam.
  Reachable from a subclass but **not** part of the public API
  contract: override a `_handle*` dispatch hook, wrap `_send`, or reach
  the underlying `_wss` / `_channels`. Subclasses may read or override
  these; they may be rearranged between minor versions. This is the
  layer the recipes below reach into.
- `__double_underscore` (TypeScript `private`) — truly internal
  implementation (e.g. `__commands`, `__connState`). **Not** accessible
  from a subclass; do not rely on it.

What this gives you: instead of waiting for `Server` to ship every
feature you might want, you can extend it yourself with full access to
the `protected` seam — and contribute the pattern back if it
generalizes.

## Recipe: Pattern subscribe via subclass

Want `chat:*` wildcards without waiting for `Server` to ship pattern
matching? Override `_handleSubscribe`:

```ts
import { Server } from '@tundralibs/rpc';
import type { ChannelOptions, InboundFrame } from '@tundralibs/rpc';
// Needs a separate install: deno add @tundralibs/compat
import type { ServerWebSocket } from '@tundralibs/compat/webserver';

export class PatternServer<T = unknown> extends Server<T> {
  private patterns: Array<{ regex: RegExp; opts: ChannelOptions<T> }> = [];

  /**
   * Register a glob-style pattern.
   * - `*` matches one segment (no `:`)
   * - `**` matches multiple segments (any depth)
   *
   * Examples:
   *   'chat:*'     matches 'chat:room1' but not 'chat:foo:bar'
   *   'user:**'    matches 'user:1', 'user:1:dm', 'user:1:meta:tags'
   */
  pattern(glob: string, opts: ChannelOptions<T>): this {
    const regex = new RegExp(
      '^' +
        glob.replace(/\*\*/g, '.+').replace(/\*/g, '[^:]+') +
        '$',
    );
    this.patterns.push({ regex, opts });
    return this;
  }

  // Lazily register a concrete channel the first time a sub frame
  // matches one of our patterns. Once registered, subsequent
  // sub/unsub/pub frames take the normal Server path.
  override _handleSubscribe(
    ws: ServerWebSocket<T>,
    frame: Extract<InboundFrame, { type: 'sub' }>,
  ): Promise<void> {
    if (!this._channels.has(frame.channel)) {
      const match = this.patterns.find((p) => p.regex.test(frame.channel));
      if (match) this._channels.set(frame.channel, match.opts);
    }
    return super._handleSubscribe(ws, frame);
  }
}
```

Use it:

```ts
import { Server } from '@tundralibs/rpc';
import type { ChannelOptions } from '@tundralibs/rpc';

// The subclass defined in the block above.
declare class PatternServer<T = unknown> extends Server<T> {
  pattern(glob: string, opts: ChannelOptions<T>): this;
}

type Conn = { userId: string };

const canJoin = (_userId: string, _channel: string): boolean => true;

const server = new PatternServer<Conn>();

server.pattern('chat:*', {
  authorize: (ctx) => canJoin(ctx.ws.data.userId, ctx.channel),
  onSubscribe: (ctx) => console.log('joined', ctx.channel),
});

server.pattern('user:**', {
  authorize: (ctx) => ctx.channel.startsWith(`user:${ctx.ws.data.userId}`),
});
```

That's the entire feature. ~25 lines. You pick the glob syntax,
precedence (exact-first vs pattern-first), cleanup policy. `Server`
provides the primitives; you compose.

For a runnable version, see
[`examples/pattern-subscribe.ts`](../examples/pattern-subscribe.ts).

### What pattern-via-subclass does NOT give you

- **Cross-process pattern subscribe.** A publish from instance A to
  `chat:room1` won't reach a `chat:*` subscriber on instance B unless
  the underlying pub/sub adapter does pattern matching server-side
  (Redis `PSUBSCRIBE`, NATS `*`/`>`). The subclass approach lazily
  registers concrete channels — fine within one `Server`, but the adapter
  still sees only literal names.
- **Capability self-description.** `MemoryPubSubAdapter.capabilities.patternSubscribe`
  stays `false` because the _adapter_ still doesn't pattern-match. The
  subclass works around this at the framework level.

When someone needs cross-process pattern subscribe, that's the
adapter contract conversation (a new optional `pSubscribe` method).
Until then, the subclass approach covers single-process apps.

## Recipe: Custom inbound frame inspection

`Server`'s middleware wraps **commands**. If you need to react to
sub/unsub/pub frames before `Server`'s standard handling, override the
matching `_handle*` method.

```ts
import { Server } from '@tundralibs/rpc';
import type { InboundFrame } from '@tundralibs/rpc';
// Needs a separate install: deno add @tundralibs/compat
import type { ServerWebSocket } from '@tundralibs/compat/webserver';

class LoggingServer<T> extends Server<T> {
  override async _handleSubscribe(
    ws: ServerWebSocket<T>,
    frame: Extract<InboundFrame, { type: 'sub' }>,
  ): Promise<void> {
    console.log('sub', frame.channel, ws.remoteAddress);
    return super._handleSubscribe(ws, frame);
  }

  override async _handlePublish(
    ws: ServerWebSocket<T>,
    frame: Extract<InboundFrame, { type: 'pub' }>,
  ): Promise<void> {
    console.log('pub', frame.channel, ws.remoteAddress);
    return super._handlePublish(ws, frame);
  }
}
```

## Recipe: Replay — last-N messages on subscribe

"New subscribers should see the last 50 messages." `Server` doesn't ship
this, but `onSubscribe` + a per-channel ring buffer does it in
~10 lines. The replay path uses the same wire shape as live `msg`
frames, so the client can't tell them apart.

```ts
import { Server } from '@tundralibs/rpc';

type Conn = { userId: string };

const server = new Server<Conn>();
const canJoin = (_userId: string, _channel: string): boolean => true;

const buffers = new Map<string, unknown[]>();
const BUFFER_SIZE = 50;

// Wrap publish so every broadcast also lands in the ring buffer.
const publishWithReplay = (channel: string, data: unknown) => {
  const buf = buffers.get(channel) ?? [];
  buf.push(data);
  if (buf.length > BUFFER_SIZE) buf.shift();
  buffers.set(channel, buf);
  return server.publish(channel, data);
};

server.channel('chat:room1', {
  authorize: (ctx) => canJoin(ctx.ws.data.userId, ctx.channel),
  onSubscribe: (ctx) => {
    // Flush history to the just-subscribed connection only.
    const recent = buffers.get(ctx.channel) ?? [];
    for (const data of recent) {
      ctx.ws.send(
        JSON.stringify({ type: 'msg', channel: ctx.channel, data }),
      );
    }
  },
});

await publishWithReplay('chat:room1', { from: 'ada', text: 'hi' });
```

`onSubscribe` fires **after** `authorize` succeeds, so unauthorized
clients never see replay. The new subscriber is the only one
receiving the replay frames (they're sent directly via `ctx.ws.send`,
not broadcast through the adapter).

### What in-memory replay does NOT give you

- **Persistence.** The buffer dies with the process. Restart the
  server → no history. Fine for "last 50 chat messages while you
  reconnect" — not fine for guaranteed event delivery.
- **Cross-process replay.** Each `Server` instance has its own buffer. A
  subscriber on instance B doesn't see messages captured by
  instance A.
- **Replay-by-cursor.** You can't say "give me everything since
  message ID X" — only "give me the last N."

For any of those, the answer is an adapter-level replay store
(Redis Streams, Kafka, NATS JetStream). That's a separate adapter
contract conversation when someone needs it.

## Recipe: Wrapping send for outbound observation

Want to inspect every outbound frame `Server` sends? Override `_send`:

```ts
import { Server } from '@tundralibs/rpc';
import type { OutboundFrame } from '@tundralibs/rpc';
// Needs a separate install: deno add @tundralibs/compat
import type { ServerWebSocket } from '@tundralibs/compat/webserver';

class ObservedServer<T> extends Server<T> {
  outboundCount = 0;

  override _send(ws: ServerWebSocket<T>, frame: OutboundFrame): void {
    this.outboundCount++;
    super._send(ws, frame);
  }
}
```

`_send` is called for every result, subscribed/unsubscribed
acknowledgement, msg fan-out, and protocol error. One choke point.

## Reaching the underlying primitive

`Server` wraps a `WebSocketServer` from `@tundralibs/compat/websocket`.
You can reach it through `server._wss` (from a subclass) if you need to
register a secondary message handler, set a custom codec, observe
backpressure, or anything else the primitive exposes that `Server` doesn't
surface directly.

```ts
import { Server } from '@tundralibs/rpc';

const metrics = {
  bp: { inc: (_labels: { remote: string | undefined }, _value: number) => {} },
};

class MetricsServer<T> extends Server<T> {
  constructor() {
    super();
    this._wss.onBackpressure((ws, buffered) => {
      metrics.bp.inc({ remote: ws.remoteAddress }, buffered);
    });
  }
}
```

## When NOT to subclass

If your extension is something most `Server` users would want, it's
probably worth proposing as a package feature instead of subclassing.
The subclass approach is the right tool when:

- You need a policy decision `Server` deliberately leaves out (pattern
  syntax, glob vs MQTT vs regex, exact-vs-pattern precedence).
- The feature is specific to your deployment / topology.
- You want to ship the change immediately rather than wait for a
  release cycle.

Conversely, if your subclass keeps growing — heartbeat policies,
metrics shapes, broadcast variations — that's a sign the underlying
abstraction needs work, not a sign you should keep subclassing.

---

[← Back to RPC](../README.md)

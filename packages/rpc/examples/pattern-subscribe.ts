/**
 * @fileoverview Pattern subscribe — runnable demo built by subclassing
 * `Server`. The package doesn't ship pattern matching out of the box;
 * this file shows how to add it in ~25 lines using the framework's
 * override surface.
 *
 * Run:
 *   deno run --allow-net packages/rpc/examples/pattern-subscribe.ts
 *
 * Then connect a WebSocket client (e.g. browser DevTools):
 *
 *   const ws = new WebSocket('ws://localhost:8088');
 *   ws.onmessage = (e) => console.log(JSON.parse(e.data));
 *   ws.onopen = () => {
 *     ws.send(JSON.stringify({ id: '1', type: 'sub', channel: 'chat:room1' }));
 *     ws.send(JSON.stringify({ id: '2', type: 'sub', channel: 'user:42:dm' }));
 *   };
 *
 * After both subscribes succeed, watch the console — the demo
 * publishes to `chat:room1` and `user:42:dm` once a second.
 *
 * @module
 */

import { Server } from '@tundralibs/rpc';
import type { ChannelOptions, InboundFrame } from '@tundralibs/rpc';
import type { ServerWebSocket } from '@tundralibs/compat/webserver';

// ---------------------------------------------------------------------------
// PatternServer — adds glob-style channel patterns to Server.
// ---------------------------------------------------------------------------

class PatternServer<T = unknown> extends Server<T> {
  private __patterns: Array<{ regex: RegExp; opts: ChannelOptions<T> }> = [];

  /**
   * Register a glob pattern.
   * - `*`  matches a single segment (no `:`)
   * - `**` matches multiple segments (any depth)
   */
  pattern(glob: string, opts: ChannelOptions<T>): this {
    const regex = new RegExp(
      '^' +
        glob.replaceAll(/\*\*/g, '.+').replaceAll(/\*/g, '[^:]+') +
        '$',
    );
    this.__patterns.push({ regex, opts });
    return this;
  }

  // Lazily register a concrete channel on the first matching sub.
  // Subsequent sub/unsub/pub frames for that name take the normal
  // Server path (exact-match Map lookup).
  override _handleSubscribe(
    ws: ServerWebSocket<T>,
    frame: Extract<InboundFrame, { type: 'sub' }>,
  ): Promise<void> {
    if (!this._channels.has(frame.channel)) {
      const match = this.__patterns.find((p) => p.regex.test(frame.channel));
      if (match) this._channels.set(frame.channel, match.opts);
    }
    return super._handleSubscribe(ws, frame);
  }
}

// ---------------------------------------------------------------------------
// Demo wiring
// ---------------------------------------------------------------------------

type Conn = { userId: string };

const server = new PatternServer<Conn>({
  upgrade: (req) => {
    // For the demo, take the userId from a query param.
    const url = new URL(req.url);
    const userId = url.searchParams.get('user') ?? 'anon';
    return { data: { userId } };
  },
});

// Public chat rooms — anyone can join `chat:<roomId>`.
server.pattern('chat:*', {
  authorize: () => true,
  onSubscribe: (ctx) =>
    console.log(`[chat] ${ctx.ws.data.userId} joined ${ctx.channel}`),
  onUnsubscribe: (ctx) =>
    console.log(`[chat] ${ctx.ws.data.userId} left ${ctx.channel}`),
});

// Per-user direct messages — only the owning user can subscribe.
server.pattern('user:**', {
  authorize: (ctx) => ctx.channel.startsWith(`user:${ctx.ws.data.userId}`),
  onSubscribe: (ctx) => console.log(`[user] subscribed to ${ctx.channel}`),
});

// Periodic publishes so you can see fan-out work.
let tick = 0;
const ticker = setInterval(() => {
  tick++;
  server.publish('chat:room1', { from: 'system', text: `tick ${tick}` });
  if (tick % 3 === 0) {
    server.publish('user:42:dm', { from: 'bot', text: `pinged ${tick}` });
  }
}, 1000);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const PORT = 8088;
await server.listen({ port: PORT });
console.log(`PatternServer demo listening on ws://localhost:${PORT}`);
console.log(
  `try:  new WebSocket('ws://localhost:${PORT}/?user=42')`,
);

// Graceful shutdown so Ctrl+C doesn't leave timers running.
const shutdown = async () => {
  clearInterval(ticker);
  await server.close();
  console.log('shutdown complete');
};

type NodeLikeProcess = {
  on?: (event: string, handler: () => void) => void;
  exit?: (code?: number) => never;
};
const proc = (globalThis as { process?: NodeLikeProcess }).process ?? undefined;

// Deno
addEventListener?.('unload', shutdown);
// Node + Bun
proc?.on?.('SIGINT', () => {
  void shutdown().then(() => proc?.exit?.(0));
});
proc?.on?.('SIGTERM', () => {
  void shutdown().then(() => proc?.exit?.(0));
});

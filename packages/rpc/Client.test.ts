/**
 * @fileoverview Tests for the {@link Client} — command/response
 * correlation, subscribe/publish round-trips, send + receive
 * middleware chains, lifecycle.
 *
 * Drives a real WebSocket against an in-process `Server` on a
 * loopback port. The Server is the source of truth for the wire
 * protocol; testing the Client against the actual Server (rather
 * than a mock WebSocket) exercises the full encode → wire → decode
 * loop and catches frame-shape drift between the two halves.
 */

import { afterEach, beforeEach, describe, it } from '@tundralibs/compat/test';
import { isBun } from '@tundralibs/compat';
import * as asserts from '@std/asserts';
import { Server } from './Server.ts';
import { Client } from './Client.ts';
import type { ClientSendContext } from './types/mod.ts';

// Use a randomised port per test to avoid TIME_WAIT contention if the
// suite is run repeatedly in quick succession.
const randomPort = () => 19000 + Math.floor(Math.random() * 1000);

// ---------------------------------------------------------------------------
// Fake WebSocket transport (reconnect state-machine tests)
// ---------------------------------------------------------------------------
// A deterministic, in-process stand-in for the global `WebSocket`. The
// reconnect tests need to simulate a transient server outage — a socket that
// opens, then can no longer be opened, then can again — without racing a real
// server bounce on a real port (TIME_WAIT, wall-clock timing). `serverUp`
// gates the outcome: while true a freshly constructed socket fires `open`;
// while false it fires `error` (a pre-open failure). `opened` counts every
// socket constructed, so a test can assert *no* new socket was opened after a
// close — a state/count assertion rather than a wall-clock one.
const fakeSocket = { serverUp: true, opened: 0 };

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  readonly url: string;
  constructor(url: string, _protocols?: string | string[]) {
    super();
    this.url = url;
    fakeSocket.opened++;
    // Settle open/error on a later microtask, mirroring the real socket's
    // async handshake — so a caller's `await this._openSocket()` suspends
    // before we dispatch, matching production ordering.
    queueMicrotask(() => {
      if (this.readyState !== 0) return; // closed before the handshake settled
      if (fakeSocket.serverUp) {
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
      } else {
        this.readyState = 3;
        this.dispatchEvent(new Event('error'));
      }
    });
  }
  send(_data: string): void {}
  close(_code?: number, _reason?: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}

// Swap the fake transport in for the duration of `fn`, then restore the real
// `WebSocket`. Scoped per-test so the rest of the suite keeps driving a real
// socket against a real `Server`.
async function withFakeWebSocket<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.WebSocket;
  fakeSocket.serverUp = true;
  fakeSocket.opened = 0;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).WebSocket = FakeWebSocket;
  try {
    return await fn();
  } finally {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).WebSocket = original;
  }
}

// Reaches the protected reconnect internals so a test can force a transport
// drop and observe whether a backoff retry is armed — same extension pattern
// as production subclasses (e.g. rAPId's typed wrapper).
class ReconnectProbeClient extends Client {
  forceDrop(): void {
    this._ws?.close();
  }
  get reconnectArmed(): boolean {
    return this._reconnectTimer !== undefined ||
      this._reconnectWake !== undefined;
  }
}

describe({
  name: 'rpc.Client',
  // We open real sockets and let the OS reclaim them; Deno's resource
  // sanitiser flags this even when everything is closed cleanly.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => suite(),
});

function suite() {
  let port: number;
  let server: Server<{ tag?: string }>;
  let client: Client;

  beforeEach(() => {
    port = randomPort();
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch { /* ignore */ }
    try {
      await server.close();
    } catch { /* ignore */ }
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  it('connect / close lifecycle transitions through expected states', async () => {
    server = new Server();
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    asserts.assertEquals(client.state, 'DISCONNECTED');
    await client.connect();
    asserts.assertEquals(client.state, 'CONNECTED');
    await client.close();
    asserts.assertEquals(client.state, 'DISCONNECTED');
  });

  it('connect() is idempotent — no-ops when already connected', async () => {
    server = new Server();
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    await client.connect(); // second call: no-op, doesn't reset state
    asserts.assertEquals(client.state, 'CONNECTED');
  });

  it('connect() rejects on unreachable server', async () => {
    client = new Client({
      url: `ws://127.0.0.1:${randomPort()}`,
      reconnect: { enabled: false },
    });
    await asserts.assertRejects(() => client.connect());
    asserts.assertEquals(client.state, 'DISCONNECTED');
  });

  // ---------------------------------------------------------------------------
  // Command / response
  // ---------------------------------------------------------------------------

  it('command() resolves with the handler return value', async () => {
    server = new Server();
    server.command('echo', undefined, (ctx) => ({ got: ctx.payload }));
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    const r = await client.command<{ got: { text: string } }>('echo', {
      text: 'hi',
    });
    asserts.assertEquals(r.got, { text: 'hi' });
  });

  it('command() rejects with server-side error message on handler throw', async () => {
    server = new Server();
    server.command('boom', undefined, () => {
      throw new Error('not today');
    });
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    await asserts.assertRejects(
      () => client.command('boom'),
      Error,
      'not today',
    );
  });

  it('command() rejects with REQUEST_TIMEOUT when handler never responds', async () => {
    server = new Server();
    // Handler resolves after 5 seconds — far past the client's 50 ms
    // timeout. Using a finite delay (rather than `new Promise(() => {})`)
    // lets the Server's `close()` reach a steady state during teardown.
    server.command('slow', undefined, () => {
      return new Promise((resolve) => setTimeout(() => resolve(null), 5000));
    });
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    await asserts.assertRejects(
      () => client.command('slow', undefined, { timeoutMs: 50 }),
      Error,
      'REQUEST_TIMEOUT',
    );
  });

  it('command() ids are unique per call (frame-id correlation)', async () => {
    server = new Server();
    server.command('echo', undefined, (ctx) => ctx.payload);
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    const results = await Promise.all([
      client.command('echo', 'a'),
      client.command('echo', 'b'),
      client.command('echo', 'c'),
    ]);
    asserts.assertEquals(results, ['a', 'b', 'c']);
  });

  it('frame ids carry a fresh per-connection nonce after reconnect', async () => {
    // Regression: ids used to be a bare `c${n}` sequence that restarted
    // each connection, so a stale `result` from the old socket could
    // resolve a freshly minted request sharing the same id. The id now
    // embeds a per-connection nonce — capture an id from the first
    // connection and assert the nonce prefix differs after a reconnect.
    const sentIds: string[] = [];
    server = new Server();
    server.command('echo', undefined, (ctx) => ctx.payload);
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    client.useSend((ctx: ClientSendContext, next) => {
      sentIds.push((ctx.frame as { id: string }).id);
      return next();
    });
    await client.connect();
    await client.command('echo', 'a');
    const firstId = sentIds.at(-1)!;

    // Drop the socket and connect again to mint ids on a new connection.
    await client.close();
    await client.connect();
    await client.command('echo', 'b');
    const secondId = sentIds.at(-1)!;

    const nonceOf = (id: string) => id.slice(0, id.lastIndexOf('-'));
    asserts.assertNotEquals(nonceOf(firstId), nonceOf(secondId));
    // Same per-call counter, different nonce — proves ids can't collide
    // across connections even though the counter restarts.
    asserts.assertEquals(firstId.split('-').at(-1), secondId.split('-').at(-1));
  });

  // ---------------------------------------------------------------------------
  // Subscribe / publish / msg
  // ---------------------------------------------------------------------------

  it('subscribe() ack and msg delivery round-trip', async () => {
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    const received: unknown[] = [];
    const sub = await client.subscribe('news', (data) => {
      received.push(data);
    });
    asserts.assertEquals(sub.channel, 'news');
    // Server-side publish should arrive on the client's handler.
    await server.publish('news', { headline: 'one' });
    await server.publish('news', { headline: 'two' });
    // Give the event loop a tick for the msg frames to land.
    await new Promise((r) => setTimeout(r, 50));
    asserts.assertEquals(received, [
      { headline: 'one' },
      { headline: 'two' },
    ]);
    await sub.unsubscribe();
  });

  it('subscribe() to unregistered channel rejects', async () => {
    server = new Server();
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    await asserts.assertRejects(() => client.subscribe('nope', () => {}));
  });

  it('subscribe() clears its pending entry on both success and rejection', async () => {
    // Regression: the sub frame registers a pending entry so an error
    // `result` can reject the call. The cleanup used to live only in the
    // success branch of the Promise.race, so a rejected subscribe left a
    // stale pending entry with an armed timeout that could reject later.
    // The pending must be cleared unconditionally once the race settles.
    class PeekClient extends Client {
      pendingSize(): number {
        return this._pending.size;
      }
    }
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });
    const peek = new PeekClient({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      // Short timeout: if a stale pending lingered, its timer would be
      // the only thing keeping the entry alive.
      defaultTimeoutMs: 50,
    });
    client = peek;
    await peek.connect();

    // Success path: subscribed ack wins the race; pending must be gone.
    await peek.subscribe('news', () => {});
    asserts.assertEquals(peek.pendingSize(), 0);

    // Rejection path: server refuses; pending must still be cleared.
    await asserts.assertRejects(() => peek.subscribe('nope', () => {}));
    asserts.assertEquals(peek.pendingSize(), 0);

    // Wait past the timeout window — nothing left armed should fire.
    await new Promise((r) => setTimeout(r, 80));
    asserts.assertEquals(peek.pendingSize(), 0);
  });

  it('subscribe() replaces handler when called twice for same channel', async () => {
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    const first: unknown[] = [];
    const second: unknown[] = [];
    await client.subscribe('news', (d) => first.push(d));
    await client.subscribe('news', (d) => second.push(d));
    await server.publish('news', { headline: 'after-replace' });
    await new Promise((r) => setTimeout(r, 50));
    asserts.assertEquals(first.length, 0);
    asserts.assertEquals(second, [{ headline: 'after-replace' }]);
  });

  it('unsubscribe() stops further messages', async () => {
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    const received: unknown[] = [];
    const sub = await client.subscribe('news', (data) => {
      received.push(data);
    });
    await server.publish('news', { i: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await sub.unsubscribe();
    await server.publish('news', { i: 2 });
    await new Promise((r) => setTimeout(r, 50));
    asserts.assertEquals(received, [{ i: 1 }]);
  });

  it('re-subscribe survives a racing stale unsubscribe ack', async () => {
    // Regression: an `unsub` immediately followed by a re-`subscribe` on
    // the same channel used to lose the new subscription. The in-flight
    // `unsubscribed` ack was applied by channel name with no id
    // correlation, so it deleted the freshly-created subscription; the
    // later `subscribed` ack then found no entry, subscribe() hung until
    // its timeout, and the (server-side live) channel silently delivered
    // nothing. The ack must be correlated to OUR unsub and leave a
    // re-created subscription intact.
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      // Short timeout so a regression fails fast instead of hanging 30 s.
      defaultTimeoutMs: 500,
    });
    await client.connect();
    const received: unknown[] = [];
    const sub = await client.subscribe('news', () => {});
    // Fire the unsub WITHOUT awaiting it so its ack is still in flight,
    // then immediately re-subscribe on the same channel.
    const unsubbing = sub.unsubscribe();
    const resub = await client.subscribe('news', (d) => received.push(d));
    await unsubbing;
    asserts.assertEquals(resub.channel, 'news');
    // The re-created subscription must still deliver.
    await server.publish('news', { headline: 'x' });
    await new Promise((r) => setTimeout(r, 100));
    asserts.assertEquals(received, [{ headline: 'x' }]);
  });

  it('re-subscribe survives a stale unsubscribe ack that lands after the ack-wait timed out', async () => {
    // Regression (round-4): unsubscribe()'s `finally` removed the unsub id
    // from `_pendingUnsubs` unconditionally — including on the timeout path,
    // where the `unsubscribed` ack is still in flight. A late ack then fell
    // through the id-correlation guard to the server-initiated branch, which
    // deletes the subscription by channel NAME — clobbering a subscription
    // legitimately re-created in the meantime. Result: silent, permanent
    // message loss on a subscription the app believes is healthy. The id
    // must stay correlated until the ack actually arrives, so a late ack is
    // recognised as OUR own and leaves the re-created subscription intact.
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      // Short timeout so unsubscribe()'s ack-wait rejects while we still
      // hold the ack in the middleware below.
      defaultTimeoutMs: 200,
    });
    // Delay ONLY the `unsubscribed` ack past the ack-wait timeout. Receive
    // middleware runs fire-and-forget per frame, so this defers just that
    // frame — the later `subscribed` ack for the re-subscribe is not blocked.
    client.useReceive(async (ctx, next) => {
      if (ctx.frame.type === 'unsubscribed') {
        await new Promise((r) => setTimeout(r, 400));
      }
      await next();
    });
    await client.connect();
    const received: unknown[] = [];
    const sub = await client.subscribe('news', () => {});
    // unsubscribe() resolves via its own 200 ms timeout while the ack is
    // still delayed (400 ms).
    await sub.unsubscribe();
    // Re-subscribe on the same channel; its `subscribed` ack is not delayed.
    const resub = await client.subscribe('news', (d) => received.push(d));
    asserts.assertEquals(resub.channel, 'news');
    // Let the delayed `unsubscribed` ack land (and be misapplied, if buggy).
    await new Promise((r) => setTimeout(r, 500));
    // The re-created subscription must still be alive and delivering.
    await server.publish('news', { headline: 'x' });
    await new Promise((r) => setTimeout(r, 100));
    asserts.assertEquals(received, [{ headline: 'x' }]);
  });

  it('unsubscribe() resolves only after the server acks', async () => {
    // The documented contract is a barrier: unsubscribe() resolves once
    // the server acks with an `unsubscribed` frame. It used to return
    // right after writing the frame (fire-and-forget), so callers relying
    // on the barrier proceeded before the server had processed the unsub.
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    const seen: string[] = [];
    client.useReceive(async (ctx, next) => {
      seen.push(ctx.frame.type);
      await next();
    });
    await client.connect();
    const sub = await client.subscribe('news', () => {});
    asserts.assertEquals(seen.includes('unsubscribed'), false);
    await sub.unsubscribe();
    // By the time unsubscribe() resolves, the ack must have arrived.
    asserts.assertEquals(seen.includes('unsubscribed'), true);
  });

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  it('useSend() middleware can mutate outbound payload', async () => {
    server = new Server();
    server.command(
      'whoami',
      undefined,
      (ctx) => (ctx.payload as { user: string }).user,
    );
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    // Inject `user: 'ada'` into every command's payload.
    client.useSend(async (ctx: ClientSendContext, next) => {
      if (ctx.frame.type === 'cmd') {
        ctx.frame.payload = {
          ...(ctx.frame.payload as object | undefined),
          user: 'ada',
        };
      }
      await next();
    });
    await client.connect();
    const who = await client.command<string>('whoami');
    asserts.assertEquals(who, 'ada');
  });

  it('useSend() middleware that skips next() short-circuits the send', async () => {
    server = new Server();
    server.command('any', undefined, () => 'should-not-fire');
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      defaultTimeoutMs: 100,
    });
    client.useSend((_ctx, _next) => {
      // Refuse to send. Don't call next() — the command stays pending
      // and times out per the default timeout.
      return Promise.resolve();
    });
    await client.connect();
    await asserts.assertRejects(
      () => client.command('any'),
      Error,
      'REQUEST_TIMEOUT',
    );
  });

  it('useReceive() middleware sees every inbound frame', async () => {
    server = new Server();
    server.command('ping', undefined, () => 'pong');
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    const seen: string[] = [];
    client.useReceive(async (ctx, next) => {
      seen.push(ctx.frame.type);
      await next();
    });
    await client.connect();
    await client.command('ping');
    // We should have seen at least one 'result' frame.
    asserts.assertEquals(seen.includes('result'), true);
  });

  it('useReceive() can drop frames by skipping next()', async () => {
    server = new Server();
    server.command('echo', undefined, (ctx) => ctx.payload);
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      defaultTimeoutMs: 100,
    });
    // Drop every result frame — the awaiting command should time out.
    client.useReceive((_ctx, _next) => {
      return Promise.resolve();
    });
    await client.connect();
    await asserts.assertRejects(
      () => client.command('echo', 'x'),
      Error,
      'REQUEST_TIMEOUT',
    );
  });

  // ---------------------------------------------------------------------------
  // Close behaviour
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Reconnect
  // ---------------------------------------------------------------------------

  it('resubscribes to active channels after a reconnect', async () => {
    // Regression: the Client tracks subscriptions in a map separate from
    // the underlying socket; on reconnect, `__resubscribeAll` replays
    // each one and refreshes the pendingAck. If that path regresses,
    // every consumer of pub/sub silently loses messages after the first
    // network blip. Test by bouncing the server on the same port and
    // observing that the second server sees a subscribe + a message
    // delivered via that subscription.

    const subscribeEvents: string[] = [];
    const sharedPort = randomPort();

    const makeServer = (tag: string): Server<{ tag?: string }> => {
      const s = new Server<{ tag?: string }>();
      s.channel('chat', {
        onSubscribe: (ctx) => {
          subscribeEvents.push(`${tag}:${ctx.channel}`);
        },
      });
      return s;
    };

    // First server
    let firstServer: Server<{ tag?: string }> | null = makeServer('s1');
    await firstServer.listen({ port: sharedPort, hostname: '127.0.0.1' });

    const received: string[] = [];
    client = new Client({
      url: `ws://127.0.0.1:${sharedPort}`,
      reconnect: {
        enabled: true,
        initialDelayMs: 50,
        maxDelayMs: 200,
        maxAttempts: 200, // many small retries — survive TIME_WAIT
        backoffFactor: 1,
      },
    });
    await client.connect();
    await client.subscribe('chat', (data) => received.push(String(data)));
    asserts.assertEquals(subscribeEvents, ['s1:chat']);

    // Bounce the server. On Deno, server.close() is graceful-only and
    // hangs on the active client unless we close each socket first.
    // On Bun, the inverse is true: closing sockets first and *then*
    // calling stop() deadlocks (server waits for the handshakes we
    // just initiated — see WebSocketServer.close() docs in compat).
    // So branch on runtime.
    if (!isBun) {
      for (const conn of firstServer.connections) conn.close(1001, 'bounce');
    }
    await firstServer.close();
    firstServer = null;

    // Bring up a fresh server on the same port. Loop a few times in
    // case of TIME_WAIT contention from the just-closed listener. If
    // every retry fails the test will fail loudly below.
    let bindAttempts = 20;
    let bound = false;
    while (bindAttempts-- > 0) {
      try {
        server = makeServer('s2');
        await server.listen({ port: sharedPort, hostname: '127.0.0.1' });
        bound = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    asserts.assert(bound, 'second server failed to bind on shared port');

    // Wait for the Client to reconnect and the new Server to see the
    // resubscribe. Poll with a deadline rather than a fixed sleep so
    // the test isn't slower than necessary.
    const subscribeDeadline = Date.now() + 5000;
    while (
      !subscribeEvents.includes('s2:chat') && Date.now() < subscribeDeadline
    ) {
      await new Promise((r) => setTimeout(r, 20));
    }
    asserts.assertEquals(subscribeEvents, ['s1:chat', 's2:chat']);

    // Now publish from the new server and confirm the handler that was
    // registered before the reconnect still receives the message.
    await server.publish('chat', 'after-reconnect');

    const deliveryDeadline = Date.now() + 2000;
    while (received.length === 0 && Date.now() < deliveryDeadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    asserts.assertEquals(received, ['after-reconnect']);
  });

  it('connect() during reconnect backoff does not open a second concurrent socket', async () => {
    // Regression (round-4 / round-3 #3): while the client is parked in
    // reconnect backoff (state reads DISCONNECTED — there is no RECONNECTING
    // state, and onReconnectFailed's docs tell apps to retry via connect()),
    // a manual connect() used to succeed while leaving the parked backoff
    // timer armed. When that timer fired it opened a SECOND socket over the
    // live one: both stayed wired to the same Client, `_resubscribeAll` ran
    // twice (duplicate delivery), and the abandoned socket's later close
    // nulled `_ws`, flipped state to DISCONNECTED and rejected healthy
    // in-flight pendings. connect() must cancel the pending backoff, and a
    // woken `_scheduleReconnect` must not open a socket once a connection
    // already exists.
    //
    // A transport-level drop (the client's own socket closing) exercises the
    // real `_handleClose` -> `_scheduleReconnect` state machine exactly as an
    // unexpected network close would, without a server-initiated close that
    // would leave a half-closed connection lingering on the server.
    class DropClient extends Client {
      forceDrop(): void {
        this._ws?.close();
      }
    }
    server = new Server();
    server.channel('news', {});
    await server.listen({ port, hostname: '127.0.0.1' });

    const dropClient = new DropClient({
      url: `ws://127.0.0.1:${port}`,
      reconnect: {
        enabled: true,
        initialDelayMs: 500,
        backoffFactor: 1,
        maxDelayMs: 500,
        maxAttempts: 50,
      },
    });
    client = dropClient;
    await dropClient.connect();
    const hits: unknown[] = [];
    await dropClient.subscribe('news', (d) => hits.push(d));

    // Drop the transport -> client enters backoff (DISCONNECTED).
    dropClient.forceDrop();
    const backoffDeadline = Date.now() + 2000;
    while (client.state !== 'DISCONNECTED' && Date.now() < backoffDeadline) {
      await new Promise((r) => setTimeout(r, 5));
    }
    asserts.assertEquals(client.state, 'DISCONNECTED');

    // Manual reconnect DURING the backoff window.
    await client.connect();
    asserts.assertEquals(client.state, 'CONNECTED');

    // Wait past the parked backoff so a leaked timer would have fired and
    // opened a duplicate socket by now.
    await new Promise((r) => setTimeout(r, 800));

    // Exactly one live server connection, and exactly one delivery per
    // publish (not two, which would prove a duplicate resubscribe).
    asserts.assertEquals(server.connections.length, 1);
    await server.publish('news', { n: 1 });
    await new Promise((r) => setTimeout(r, 100));
    asserts.assertEquals(hits, [{ n: 1 }]);
    // State stays CONNECTED — no stale-socket close corrupted it.
    asserts.assertEquals(client.state, 'CONNECTED');
  });

  it('failed manual connect() during backoff still auto-reconnects (round-5 C1)', async () => {
    // Regression (round-5 C1): the round-4 fix made connect() cancel the
    // parked backoff timer so a manual reconnect couldn't race a second
    // socket. But it cancelled unconditionally — a manual connect() that then
    // FAILED (server still down) tore down the parked backoff AND scheduled no
    // replacement, silently disabling all future auto-reconnect. The client
    // stayed DISCONNECTED forever with reconnect.enabled=true. A failed manual
    // connect() during backoff must SUPERSEDE the parked attempt yet RE-ARM
    // the schedule, so the client still recovers on its own once the server
    // returns. Driven over a fake transport so the outage is deterministic.
    await withFakeWebSocket(async () => {
      const c = new ReconnectProbeClient({
        url: 'ws://fake-transport',
        reconnect: {
          enabled: true,
          initialDelayMs: 300,
          maxDelayMs: 300,
          backoffFactor: 1,
          maxAttempts: 100,
        },
      });
      client = c; // afterEach cleanup
      await c.connect();
      asserts.assertEquals(c.state, 'CONNECTED');

      // Outage: server down + live socket dropped -> client parks in backoff.
      fakeSocket.serverUp = false;
      c.forceDrop();
      const parkDeadline = Date.now() + 2000;
      while (
        !(c.state === 'DISCONNECTED' && c.reconnectArmed) &&
        Date.now() < parkDeadline
      ) {
        await new Promise((r) => setTimeout(r, 5));
      }
      asserts.assertEquals(c.state, 'DISCONNECTED');
      asserts.assert(
        c.reconnectArmed,
        'expected a reconnect backoff to be armed',
      );

      // App reacts to DISCONNECTED and manually connect()s to recover faster —
      // server still down, so this connect() rejects.
      await asserts.assertRejects(() => c.connect());
      asserts.assertEquals(c.state, 'DISCONNECTED');
      // The crux: a failed manual connect() must leave auto-reconnect armed.
      asserts.assert(
        c.reconnectArmed,
        'failed manual connect() during backoff must re-arm auto-reconnect',
      );

      // Server recovers. The client must reconnect on its OWN — no further
      // manual connect().
      fakeSocket.serverUp = true;
      const recoverDeadline = Date.now() + 5000;
      while (c.state !== 'CONNECTED' && Date.now() < recoverDeadline) {
        await new Promise((r) => setTimeout(r, 10));
      }
      asserts.assertEquals(c.state, 'CONNECTED');
    });
  });

  it('close() during reconnect backoff stops reconnecting', async () => {
    // Sibling of the round-5 C1 fix: while parked in backoff `state` reads
    // DISCONNECTED, so close() must NOT be fooled into a no-op — it has to
    // cancel the pending retry and latch the close intent, or the client would
    // reconnect the moment the server returned, defying "close stops
    // reconnecting". Asserted by count: no new socket may open after close().
    await withFakeWebSocket(async () => {
      const c = new ReconnectProbeClient({
        url: 'ws://fake-transport',
        reconnect: {
          enabled: true,
          initialDelayMs: 300,
          maxDelayMs: 300,
          backoffFactor: 1,
          maxAttempts: 100,
        },
      });
      client = c; // afterEach cleanup
      await c.connect();
      asserts.assertEquals(c.state, 'CONNECTED');

      // Outage -> client parks in backoff.
      fakeSocket.serverUp = false;
      c.forceDrop();
      const parkDeadline = Date.now() + 2000;
      while (
        !(c.state === 'DISCONNECTED' && c.reconnectArmed) &&
        Date.now() < parkDeadline
      ) {
        await new Promise((r) => setTimeout(r, 5));
      }
      asserts.assert(
        c.reconnectArmed,
        'expected a reconnect backoff to be armed',
      );

      // Explicit close DURING backoff must cancel the parked retry.
      await c.close();
      asserts.assertEquals(c.state, 'DISCONNECTED');
      asserts.assert(
        !c.reconnectArmed,
        'close() during backoff must cancel the reconnect',
      );

      // Server recovers. The client must stay put — no auto-reconnect.
      fakeSocket.serverUp = true;
      const opensBefore = fakeSocket.opened;
      await new Promise((r) => setTimeout(r, 1000)); // > 3 backoff windows
      asserts.assertEquals(c.state, 'DISCONNECTED');
      asserts.assertEquals(
        fakeSocket.opened,
        opensBefore,
        'no new socket may be opened after close()',
      );
    });
  });

  it('close() rejects any in-flight commands with CLOSED', async () => {
    server = new Server();
    // Bounded slow handler so server.close() can reach a steady state
    // during afterEach teardown.
    server.command(
      'slow',
      undefined,
      () => new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    );
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
    });
    await client.connect();
    const inflight = client.command('slow', undefined, { timeoutMs: 0 });
    // Attach a noop catcher BEFORE close() — close() rejects all
    // pending requests synchronously inside `__rejectAllPending`, and
    // V8 reports the rejection as unhandled if no handler is attached
    // by the next microtask flush. `assertRejects` runs further down,
    // too late to suppress the unhandledRejection diagnostic.
    inflight.catch(() => {});
    await client.close();
    await asserts.assertRejects(() => inflight, Error, 'CLOSED');
  });

  // ---------------------------------------------------------------------------
  // Send-path failures (orphaned pending)
  // ---------------------------------------------------------------------------

  it('command() drops its pending on a send-path throw (no orphan)', async () => {
    // Regression: command() registered a pending entry (arming a
    // REQUEST_TIMEOUT timer) and only THEN awaited the send. A throwing
    // useSend middleware — the documented way to reject a caller — made
    // command() reject as expected, but left the pending live; its timer
    // later rejected a promise nobody held, a process-fatal unhandled
    // rejection. The pending must be dropped when the send path throws.
    class PeekClient extends Client {
      pendingSize(): number {
        return this._pending.size;
      }
    }
    server = new Server();
    server.command('echo', undefined, (ctx) => ctx.payload);
    await server.listen({ port, hostname: '127.0.0.1' });
    const peek = new PeekClient({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      // Short timeout: a leaked pending would fire (and reject unhandled)
      // within this window.
      defaultTimeoutMs: 50,
    });
    client = peek;
    await peek.connect();
    peek.useSend(() => {
      throw new Error('auth token missing');
    });
    await asserts.assertRejects(
      () => peek.command('echo', 1),
      Error,
      'auth token missing',
    );
    // No orphaned pending immediately after the rejection…
    asserts.assertEquals(peek.pendingSize(), 0);
    // …and nothing fires once the (short) timeout window has elapsed.
    await new Promise((r) => setTimeout(r, 80));
    asserts.assertEquals(peek.pendingSize(), 0);
  });

  it('publish() drops its pending on a send-path throw (no orphan)', async () => {
    class PeekClient extends Client {
      pendingSize(): number {
        return this._pending.size;
      }
    }
    server = new Server();
    server.channel('news', { onPublish: () => {} });
    await server.listen({ port, hostname: '127.0.0.1' });
    const peek = new PeekClient({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      defaultTimeoutMs: 50,
    });
    client = peek;
    await peek.connect();
    peek.useSend(() => {
      throw new Error('send blocked');
    });
    await asserts.assertRejects(
      () => peek.publish('news', { x: 1 }),
      Error,
      'send blocked',
    );
    asserts.assertEquals(peek.pendingSize(), 0);
    await new Promise((r) => setTimeout(r, 80));
    asserts.assertEquals(peek.pendingSize(), 0);
  });

  it('publish() with an undefined payload resolves like publish(ch, null)', async () => {
    // Regression: publish() built `{ id, type:'pub', channel, payload }` and
    // passed `payload` straight through. When it was `undefined`,
    // `JSON.stringify` DROPPED the key, so the wire frame lost `payload`
    // entirely. The server's pub decoder requires `'payload' in obj` and
    // rejects the frame as malformed, replying with an id-less BAD_FORMAT
    // `error` frame the client can't correlate to the outstanding request —
    // so publish() hung until its request timeout (30s by default) before
    // rejecting REQUEST_TIMEOUT, while `publish(ch, null)` worked. The fix
    // normalizes undefined -> null so the key always survives serialization.
    //
    // Red-before: against pre-fix Client.ts this call never gets an ack and
    // rejects with REQUEST_TIMEOUT after `defaultTimeoutMs` (kept short here
    // so the red proof is fast, not a 30s wait). Green-after: it resolves and
    // the server's onPublish receives `null`, matching the explicit-null case.
    const seen: unknown[] = [];
    server = new Server();
    server.channel('news', {
      onPublish: (_ctx, payload) => {
        seen.push(payload);
      },
    });
    await server.listen({ port, hostname: '127.0.0.1' });
    client = new Client({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { enabled: false },
      defaultTimeoutMs: 1000,
    });
    await client.connect();
    // A `pub` is only accepted from a subscribed connection.
    await client.subscribe('news', () => {});
    // Must resolve (server acks), not hang until REQUEST_TIMEOUT.
    await client.publish('news', undefined);
    asserts.assertEquals(seen, [null]);
  });
}

/**
 * @fileoverview Tests for Server command + channel + middleware
 * + pub/sub flow. Drives the underlying WebSocketServer's internal
 * handlers directly with a mock WebSocket so we don't need a real
 * network connection.
 */

import { describe, it } from '@tundralibs/compat/test';
import { Server } from './Server.ts';
import type { InboundFrame, OutboundFrame } from './types/mod.ts';
import type { ServerWebSocket } from '@tundralibs/compat/webserver';
import * as asserts from '@std/asserts';

/**
 * In-memory ServerWebSocket stand-in. Captures every `send` call as a
 * decoded frame so tests can assert on protocol traffic directly.
 */
class MockWs<T = unknown> {
  sent: OutboundFrame[] = [];
  closed = false;

  constructor(public data: T = undefined as unknown as T) {}

  send(payload: string | Uint8Array | ArrayBuffer): void {
    if (typeof payload !== 'string') return;
    this.sent.push(JSON.parse(payload) as OutboundFrame);
  }
  close(): void {
    this.closed = true;
  }
  ping(): boolean {
    return false;
  }
  pong(): boolean {
    return false;
  }
  readonly readyState = 1;
  bufferedAmount = 0;
  readonly protocol = '';
  readonly remoteAddress: string | undefined = '127.0.0.1';

  asServerWebSocket(): ServerWebSocket<T> {
    return this as unknown as ServerWebSocket<T>;
  }
}

const upgradeContext = {
  request: new Request('http://localhost/'),
  remoteAddress: '127.0.0.1',
  remotePort: 0,
};

// White-box test access — Server._wss is a `protected` extension seam,
// but these helpers inject test frames at the WebSocket layer from
// outside the class. Cast through `any` to bypass the type-check; the
// runtime access is the whole point of these helpers.
// deno-lint-ignore-file no-explicit-any
const peekWss = <T>(hub: Server<T>): any => (hub as any)._wss;

const send = <T>(
  hub: Server<T>,
  ws: MockWs<T>,
  raw: string,
): Promise<void> => peekWss(hub).__handleMessage(ws.asServerWebSocket(), raw);

const open = <T>(hub: Server<T>, ws: MockWs<T>): Promise<void> =>
  peekWss(hub).__handleOpen(ws.asServerWebSocket(), upgradeContext);

const close = <T>(hub: Server<T>, ws: MockWs<T>): Promise<void> =>
  peekWss(hub).__handleClose(ws.asServerWebSocket(), 1000, '');

const encodeInbound = (frame: InboundFrame): string => JSON.stringify(frame);

describe({
  name: 'rpc.Server',
  fn: () => {
    // =========================================================================
    // Frame validation
    // =========================================================================

    describe('frame validation', () => {
      it('replies with BAD_FORMAT on invalid JSON', async () => {
        const hub = new Server();
        const ws = new MockWs();
        await open(hub, ws);
        await send(hub, ws, 'not json');
        asserts.assertEquals(ws.sent, [{
          type: 'error',
          code: 'BAD_FORMAT',
          message: 'invalid frame',
        }]);
        await hub.close();
      });

      it('replies with BAD_FORMAT on binary frames', async () => {
        const hub = new Server();
        const ws = new MockWs();
        await open(hub, ws);
        await peekWss(hub).__handleMessage(
          ws.asServerWebSocket(),
          new Uint8Array([1, 2, 3]),
        );
        const last = ws.sent.at(-1);
        asserts.assertEquals(
          (last as { code: string }).code,
          'BAD_FORMAT',
        );
        await hub.close();
      });

      it('rejects unknown frame type, correlating the recoverable id', async () => {
        const hub = new Server();
        const ws = new MockWs();
        await open(hub, ws);
        // Well-formed JSON with a valid id but an unknown type. The frame
        // is malformed, but its id is recoverable — so the BAD_FORMAT
        // error frame carries it back, letting the client reject the
        // correlated pending request instead of hanging until timeout.
        await send(hub, ws, '{"id":"1","type":"weird"}');
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'error',
          code: 'BAD_FORMAT',
          message: 'invalid frame',
        });
        await hub.close();
      });

      it('correlates the id on a missing-field BAD_FORMAT frame', async () => {
        const hub = new Server();
        const ws = new MockWs();
        await open(hub, ws);
        // A `pub` frame missing its required `payload` — the exact shape
        // the publish(undefined) regression produced. The id is still
        // recoverable and must come back on the error frame.
        await send(hub, ws, '{"id":"p1","type":"pub","channel":"x"}');
        asserts.assertEquals(ws.sent[0], {
          id: 'p1',
          type: 'error',
          code: 'BAD_FORMAT',
          message: 'invalid frame',
        });
        await hub.close();
      });

      it('omits id on a BAD_FORMAT frame with no recoverable id', async () => {
        const hub = new Server();
        const ws = new MockWs();
        await open(hub, ws);
        // Invalid JSON carries no recoverable id — the error frame stays
        // id-less, as the doc says.
        await send(hub, ws, 'not json');
        asserts.assertEquals(ws.sent[0], {
          type: 'error',
          code: 'BAD_FORMAT',
          message: 'invalid frame',
        });
        // Valid JSON object but no usable id — also id-less.
        ws.sent.length = 0;
        await send(hub, ws, '{"type":"cmd","cmd":"foo"}');
        asserts.assertEquals(ws.sent[0], {
          type: 'error',
          code: 'BAD_FORMAT',
          message: 'invalid frame',
        });
        await hub.close();
      });

      it('replies with FRAME_TOO_LARGE (id-less by design) for oversize frames', async () => {
        const hub = new Server({ maxFrameSize: 32 });
        const ws = new MockWs();
        await open(hub, ws);
        // The frame carries a valid id, but FRAME_TOO_LARGE stays id-less
        // on purpose: the payload is over `maxFrameSize`, and JSON.parsing
        // an over-limit blob just to correlate would reintroduce the very
        // cost the size gate exists to avoid. So — unlike BAD_FORMAT — no
        // id is recovered here.
        await send(
          hub,
          ws,
          encodeInbound({
            id: '1',
            type: 'cmd',
            cmd: 'echo',
            payload: 'x'.repeat(200),
          }),
        );
        asserts.assertEquals(ws.sent, [{
          type: 'error',
          code: 'FRAME_TOO_LARGE',
          message: 'frame exceeds maximum size',
        }]);
        await hub.close();
      });
    });

    // =========================================================================
    // Commands
    // =========================================================================

    describe('command()', () => {
      it('runs a registered handler and returns its value', async () => {
        const hub = new Server();
        hub.command('echo', undefined, (ctx) => ({ echoed: ctx.payload }));

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'echo', payload: 'hi' }),
        );

        asserts.assertEquals(ws.sent, [{
          id: '1',
          type: 'result',
          ok: true,
          data: { echoed: 'hi' },
        }]);
        await hub.close();
      });

      it('UNKNOWN_COMMAND for unregistered command', async () => {
        const hub = new Server();
        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'nope' }),
        );
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'result',
          ok: false,
          error: { code: 'UNKNOWN_COMMAND', message: 'unknown command: nope' },
        });
        await hub.close();
      });

      it('runs the validator and surfaces failures as VALIDATION', async () => {
        const hub = new Server();
        hub.command(
          'create',
          (input) => {
            if (typeof input !== 'object' || input === null) {
              throw new Error('expected object');
            }
            const name = (input as { name: unknown }).name;
            if (typeof name !== 'string') throw new Error('name required');
            return { name };
          },
          (ctx) => ctx.payload,
        );

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({
            id: '1',
            type: 'cmd',
            cmd: 'create',
            payload: { wrong: 'shape' },
          }),
        );
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'result',
          ok: false,
          error: { code: 'VALIDATION', message: 'name required' },
        });
        await hub.close();
      });

      it('passes validated payload to the handler', async () => {
        const hub = new Server();
        let observed: unknown;
        hub.command(
          'echo',
          (input) => ({ wrapped: input }),
          (ctx) => {
            observed = ctx.payload;
            return ctx.payload;
          },
        );

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'echo', payload: 42 }),
        );
        asserts.assertEquals(observed, { wrapped: 42 });
        asserts.assertStrictEquals(
          (ws.sent[0] as { type: string }).type,
          'result',
        );
        await hub.close();
      });

      it('handler throws → HANDLER_ERROR', async () => {
        const hub = new Server();
        hub.command('boom', undefined, () => {
          throw new Error('crash');
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'boom' }),
        );
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'result',
          ok: false,
          error: { code: 'HANDLER_ERROR', message: 'crash' },
        });
        await hub.close();
      });

      it('a thrown error carries code AND structured data to the client', async () => {
        const hub = new Server();
        hub.command('validate', undefined, () => {
          // The documented way a handler sends detail with a failure.
          throw Object.assign(new Error('Validation failed'), {
            code: 'VALIDATION_FAILED',
            data: { fields: { email: 'already taken' } },
          });
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'validate' }),
        );
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'result',
          ok: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            data: { fields: { email: 'already taken' } },
          },
        });
        await hub.close();
      });

      it('a thrown error WITHOUT data omits the field entirely', async () => {
        // Byte-identical to what a pre-`data` server sent.
        const hub = new Server();
        hub.command('plain', undefined, () => {
          throw new Error('nope');
        });
        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'plain' }),
        );
        const frame = ws.sent[0] as { error: Record<string, unknown> };
        asserts.assertEquals(Object.keys(frame.error).sort(), [
          'code',
          'message',
        ]);
        await hub.close();
      });

      it('throws when registering the same name twice', () => {
        const hub = new Server();
        hub.command('foo', undefined, () => 1);
        asserts.assertThrows(
          () => hub.command('foo', undefined, () => 2),
          Error,
          'already registered',
        );
      });
    });

    // =========================================================================
    // Middleware
    // =========================================================================

    describe('middleware', () => {
      it('runs in registration order, wrapping the handler', async () => {
        const hub = new Server();
        const order: string[] = [];
        hub.use(async (_ctx, next) => {
          order.push('a:before');
          await next();
          order.push('a:after');
        });
        hub.use(async (_ctx, next) => {
          order.push('b:before');
          await next();
          order.push('b:after');
        });
        hub.command('cmd', undefined, () => {
          order.push('handler');
          return 'ok';
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'cmd' }),
        );
        asserts.assertEquals(order, [
          'a:before',
          'b:before',
          'handler',
          'b:after',
          'a:after',
        ]);
        await hub.close();
      });

      it('can short-circuit by not calling next', async () => {
        const hub = new Server();
        let handlerCalled = false;
        hub.use(async (_ctx, _next) => {
          // skip next() entirely
        });
        hub.command('cmd', undefined, () => {
          handlerCalled = true;
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'cmd' }),
        );
        asserts.assertFalse(handlerCalled);
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'result',
          ok: true,
        });
        await hub.close();
      });

      it('throws from middleware → custom code', async () => {
        const hub = new Server();
        hub.use(async (_ctx, _next) => {
          const err = new Error('blocked') as Error & { code: string };
          err.code = 'AUTH_REQUIRED';
          throw err;
        });
        hub.command('cmd', undefined, () => 'ok');

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'cmd' }),
        );
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'result',
          ok: false,
          error: { code: 'AUTH_REQUIRED', message: 'blocked' },
        });
        await hub.close();
      });

      it('middleware calling next() twice throws RpcStateError — handler runs once', async () => {
        const hub = new Server();
        let handlerCalls = 0;
        hub.use(async (_ctx, next) => {
          await next();
          // The second next() must throw (double-next guard) rather than
          // re-running the downstream chain — otherwise the handler fires
          // twice (duplicated side effects, e.g. a double charge).
          await next();
        });
        hub.command('cmd', undefined, () => {
          handlerCalls++;
          return 'ok';
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'cmd' }),
        );

        asserts.assertEquals(handlerCalls, 1);
        const last = ws.sent.at(-1) as {
          type: string;
          ok: boolean;
          error?: { code: string; message: string };
        };
        asserts.assertEquals(last.type, 'result');
        asserts.assertEquals(last.ok, false);
        asserts.assertMatch(
          last.error?.message ?? '',
          /next\(\) more than once/i,
        );
        await hub.close();
      });

      it('shares ctx.state across middleware and handler', async () => {
        const hub = new Server();
        hub.use(async (ctx, next) => {
          ctx.state.userId = 'u1';
          await next();
        });
        hub.command('cmd', undefined, (ctx) => ctx.state.userId);

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'cmd' }),
        );
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'result',
          ok: true,
          data: 'u1',
        });
        await hub.close();
      });
    });

    // =========================================================================
    // Channels (subscribe / publish / unsubscribe)
    // =========================================================================

    describe('channel()', () => {
      it('UNKNOWN_CHANNEL on subscribe to unregistered channel', async () => {
        const hub = new Server();
        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'nope' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'UNKNOWN_CHANNEL',
        );
        await hub.close();
      });

      it('confirms subscribe and delivers published messages', async () => {
        const hub = new Server();
        hub.channel('topic', {});

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(ws.sent[0], {
          id: '1',
          type: 'subscribed',
          channel: 'topic',
        });

        await hub.publish('topic', { msg: 'hello' });
        asserts.assertEquals(ws.sent[1], {
          type: 'msg',
          channel: 'topic',
          data: { msg: 'hello' },
        });
        await hub.close();
      });

      it('refuses subscribe when authorize returns false', async () => {
        const hub = new Server();
        hub.channel('topic', { authorize: () => false });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'FORBIDDEN',
        );
        await hub.close();
      });

      it('AUTHZ_ERROR when authorize throws', async () => {
        const hub = new Server();
        hub.channel('topic', {
          authorize: () => {
            throw new Error('check failed');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'AUTHZ_ERROR',
        );
        await hub.close();
      });

      it('disconnect during async authorize leaves no leaked subscription', async () => {
        const hub = new Server();
        // A deferred authorize we release manually, plus a signal that
        // fires once the handler has actually suspended inside it — no
        // sleeps, fully deterministic.
        let releaseAuthz!: (allowed: boolean) => void;
        const authzGate = new Promise<boolean>((resolve) => {
          releaseAuthz = resolve;
        });
        let markEntered!: () => void;
        const entered = new Promise<void>((resolve) => {
          markEntered = resolve;
        });
        hub.channel('topic', {
          authorize: () => {
            markEntered();
            return authzGate;
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        // Kick off the subscribe; it suspends inside `authorize`.
        const subscribing = send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        await entered;
        // The socket drops while authorize is still pending.
        await close(hub, ws);
        // authorize now resolves `true` — but the connection is gone, so
        // the subscribe must NOT create a subscription bound to it.
        releaseAuthz(true);
        await subscribing;

        // A later publish must not invoke a handler on the dead socket.
        ws.sent.length = 0;
        await hub.publish('topic', 'after-disconnect');
        const delivered = ws.sent.filter(
          (f) => (f as { type?: string }).type === 'msg',
        );
        asserts.assertEquals(delivered, []);

        await hub.close();
      });

      it('server close during async authorize does not throw or subscribe', async () => {
        const hub = new Server();
        let releaseAuthz!: (allowed: boolean) => void;
        const authzGate = new Promise<boolean>((resolve) => {
          releaseAuthz = resolve;
        });
        let markEntered!: () => void;
        const entered = new Promise<void>((resolve) => {
          markEntered = resolve;
        });
        hub.channel('topic', {
          authorize: () => {
            markEntered();
            return authzGate;
          },
        });
        // Capture any error that escapes `_dispatch` into the primitive.
        const errors: unknown[] = [];
        peekWss(hub).onError((err: unknown) => {
          errors.push(err);
        });

        const ws = new MockWs();
        await open(hub, ws);
        const subscribing = send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        await entered;
        // Server shuts down while authorize is still pending.
        await hub.close();
        // authorize resolves `true` — subscribing on the now-closed
        // adapter would throw `subscribe after close()`; the guard must
        // short-circuit before reaching it.
        releaseAuthz(true);
        await subscribing;

        asserts.assertEquals(errors, []);
      });

      it('fires onSubscribe / onUnsubscribe', async () => {
        const hub = new Server();
        const events: string[] = [];
        hub.channel('topic', {
          onSubscribe: () => {
            events.push('sub');
          },
          onUnsubscribe: () => {
            events.push('unsub');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        await send(
          hub,
          ws,
          encodeInbound({ id: '2', type: 'unsub', channel: 'topic' }),
        );
        asserts.assertEquals(events, ['sub', 'unsub']);
        await hub.close();
      });

      it('client publish refused when channel has no onPublish', async () => {
        const hub = new Server();
        hub.channel('topic', {});

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({
            id: '1',
            type: 'pub',
            channel: 'topic',
            payload: 'x',
          }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'PUBLISH_REFUSED',
        );
        await hub.close();
      });

      it('client publish runs onPublish handler when subscribed', async () => {
        const hub = new Server();
        const seen: unknown[] = [];
        hub.channel('topic', {
          onPublish: (_ctx, payload) => {
            seen.push(payload);
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        // Publish requires an active subscription first.
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        ws.sent.length = 0;
        await send(
          hub,
          ws,
          encodeInbound({
            id: '2',
            type: 'pub',
            channel: 'topic',
            payload: 'hello',
          }),
        );
        asserts.assertEquals(seen, ['hello']);
        asserts.assertStrictEquals(
          (ws.sent[0] as { type: string; ok: boolean }).ok,
          true,
        );
        await hub.close();
      });

      it('client publish rejected with NOT_SUBSCRIBED when not subscribed', async () => {
        const hub = new Server();
        const seen: unknown[] = [];
        hub.channel('topic', {
          onPublish: (_ctx, payload) => {
            seen.push(payload);
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        // No subscribe first — must be refused even though onPublish exists.
        await send(
          hub,
          ws,
          encodeInbound({
            id: '1',
            type: 'pub',
            channel: 'topic',
            payload: 'hello',
          }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'NOT_SUBSCRIBED',
        );
        // Handler must not have run for the un-subscribed publish.
        asserts.assertEquals(seen, []);
        await hub.close();
      });

      it('client publish rejected when authorize denied the subscribe', async () => {
        // An unauthorized client never gets a subscription, so its
        // publish is refused — authorize gates the publish path too.
        const hub = new Server();
        const seen: unknown[] = [];
        hub.channel('topic', {
          authorize: () => false,
          onPublish: (_ctx, payload) => {
            seen.push(payload);
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'FORBIDDEN',
        );
        ws.sent.length = 0;
        await send(
          hub,
          ws,
          encodeInbound({
            id: '2',
            type: 'pub',
            channel: 'topic',
            payload: 'hello',
          }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'NOT_SUBSCRIBED',
        );
        asserts.assertEquals(seen, []);
        await hub.close();
      });

      it('re-subscribe re-runs authorize and drops sub when now forbidden', async () => {
        let allow = true;
        const events: string[] = [];
        const hub = new Server();
        hub.channel('topic', {
          authorize: () => allow,
          onSubscribe: () => {
            events.push('sub');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        // First subscribe: authorized.
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { type: string }).type,
          'subscribed',
        );
        asserts.assertEquals(events, ['sub']);

        // Authz state changes — a re-subscribe must re-check and reject,
        // dropping the existing subscription so further publishes stop.
        allow = false;
        ws.sent.length = 0;
        await send(
          hub,
          ws,
          encodeInbound({ id: '2', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'FORBIDDEN',
        );
        // onSubscribe not fired again, and the old sub was dropped.
        asserts.assertEquals(events, ['sub']);
        ws.sent.length = 0;
        await hub.publish('topic', 'should not arrive');
        asserts.assertEquals(ws.sent, []);
        await hub.close();
      });

      it('forced drop on a FORBIDDEN re-subscribe fires onUnsubscribe', async () => {
        // Regression: onSubscribe fired for the original subscribe, but
        // force-dropping the subscription when a re-subscribe is now
        // forbidden skipped onUnsubscribe — so lifecycle-paired app state
        // (presence counters, room membership) permanently desynced. Every
        // other removal path (explicit unsub, disconnect) fires the hook;
        // this one must too.
        let allow = true;
        const events: string[] = [];
        const hub = new Server();
        hub.channel('topic', {
          authorize: () => allow,
          onSubscribe: () => {
            events.push('sub');
          },
          onUnsubscribe: () => {
            events.push('unsub');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(events, ['sub']);

        // Role revoked — the re-subscribe is refused and the live
        // subscription force-dropped, which must fire onUnsubscribe.
        allow = false;
        ws.sent.length = 0;
        await send(
          hub,
          ws,
          encodeInbound({ id: '2', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'FORBIDDEN',
        );
        asserts.assertEquals(events, ['sub', 'unsub']);
        await hub.close();
      });

      it('no onUnsubscribe on a first-time FORBIDDEN subscribe (never subscribed)', async () => {
        // The hook only pairs with a prior onSubscribe. A client that was
        // never subscribed and is refused outright must NOT fire
        // onUnsubscribe.
        const events: string[] = [];
        const hub = new Server();
        hub.channel('topic', {
          authorize: () => false,
          onUnsubscribe: () => {
            events.push('unsub');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(
          (ws.sent[0] as { error: { code: string } }).error.code,
          'FORBIDDEN',
        );
        asserts.assertEquals(events, []);
        await hub.close();
      });

      it('a tidy-up unsub after a FORBIDDEN force-drop does not double-fire onUnsubscribe', async () => {
        // Regression (round-4): the force-drop path in `_handleSubscribe`
        // fires onUnsubscribe for the subscription it removes. But the drop
        // is silent (only a FORBIDDEN `result` goes out, never an
        // `unsubscribed` frame), so a raw-protocol client still believes it
        // holds the subscription and sends its own tidy-up `unsub`.
        // `_handleUnsubscribe` used to fire onUnsubscribe unconditionally, so
        // that stray frame fired a SECOND onUnsubscribe for a single
        // onSubscribe — driving lifecycle-paired app state (presence
        // counters, room membership) negative. The hook must fire exactly
        // once per onSubscribe.
        let allow = true;
        let presence = 0;
        const events: string[] = [];
        const hub = new Server();
        hub.channel('room', {
          authorize: () => allow,
          onSubscribe: () => {
            presence++;
            events.push('sub');
          },
          onUnsubscribe: () => {
            presence--;
            events.push('unsub');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'room' }),
        );
        asserts.assertEquals(presence, 1);

        // Role revoked — the re-subscribe is refused and the live
        // subscription force-dropped, which fires onUnsubscribe once.
        allow = false;
        await send(
          hub,
          ws,
          encodeInbound({ id: '2', type: 'sub', channel: 'room' }),
        );
        asserts.assertEquals(presence, 0);

        // Client tidies up its now-dead handle with an explicit `unsub`.
        // The subscription is already gone server-side, so this must NOT
        // fire the hook a second time.
        ws.sent.length = 0;
        await send(
          hub,
          ws,
          encodeInbound({ id: '3', type: 'unsub', channel: 'room' }),
        );
        asserts.assertEquals(presence, 0);
        asserts.assertEquals(events, ['sub', 'unsub']);
        // The stray `unsub` is still acked (idempotent, per the protocol).
        asserts.assertEquals(
          (ws.sent.at(-1) as { type: string }).type,
          'unsubscribed',
        );
        await hub.close();
      });

      it('a stray unsub for a never-subscribed channel does not fire onUnsubscribe', async () => {
        // The hook only pairs with a prior onSubscribe. An `unsub` for a
        // channel this connection was never subscribed to is acked
        // (idempotent) but must not fire onUnsubscribe — otherwise the
        // counter under-counts.
        const events: string[] = [];
        const hub = new Server();
        hub.channel('room', {
          onUnsubscribe: () => {
            events.push('unsub');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'unsub', channel: 'room' }),
        );
        // Idempotent ack, but no hook (nothing was actually removed).
        asserts.assertEquals(
          (ws.sent.at(-1) as { type: string }).type,
          'unsubscribed',
        );
        asserts.assertEquals(events, []);
        await hub.close();
      });

      it('re-subscribe re-acks without a second onSubscribe when still authorized', async () => {
        const events: string[] = [];
        const hub = new Server();
        hub.channel('topic', {
          authorize: () => true,
          onSubscribe: () => {
            events.push('sub');
          },
        });

        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        await send(
          hub,
          ws,
          encodeInbound({ id: '2', type: 'sub', channel: 'topic' }),
        );
        // Second ack is a plain `subscribed`, but onSubscribe fires once.
        asserts.assertEquals(
          (ws.sent[1] as { type: string }).type,
          'subscribed',
        );
        asserts.assertEquals(events, ['sub']);

        // Still exactly one underlying subscription — a publish delivers once.
        ws.sent.length = 0;
        await hub.publish('topic', 42);
        asserts.assertEquals(ws.sent, [
          { type: 'msg', channel: 'topic', data: 42 },
        ]);
        await hub.close();
      });

      it('publish reaches multiple connections subscribed to the same channel', async () => {
        const hub = new Server();
        hub.channel('topic', {});

        const a = new MockWs();
        const b = new MockWs();
        await open(hub, a);
        await open(hub, b);
        await send(
          hub,
          a,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        await send(
          hub,
          b,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        a.sent.length = 0;
        b.sent.length = 0;

        await hub.publish('topic', 42);
        asserts.assertEquals(a.sent, [
          { type: 'msg', channel: 'topic', data: 42 },
        ]);
        asserts.assertEquals(b.sent, [
          { type: 'msg', channel: 'topic', data: 42 },
        ]);
        await hub.close();
      });

      it('cleans up subscriptions on connection close', async () => {
        const hub = new Server();
        hub.channel('topic', {});
        const ws = new MockWs();
        await open(hub, ws);
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        await close(hub, ws);
        ws.sent.length = 0;

        await hub.publish('topic', 'should not arrive');
        asserts.assertEquals(ws.sent, []);
        await hub.close();
      });

      it('throws when registering same channel twice', () => {
        const hub = new Server();
        hub.channel('topic', {});
        asserts.assertThrows(
          () => hub.channel('topic', {}),
          Error,
          'already registered',
        );
      });
    });

    // =========================================================================
    // Adapter inspection
    // =========================================================================

    describe('adapter', () => {
      it('exposes the active pub/sub adapter and its capabilities', async () => {
        const hub = new Server();
        asserts.assertStrictEquals(
          hub.adapter.capabilities.crossProcess,
          false,
        );
        asserts.assertStrictEquals(
          hub.adapter.capabilities.guaranteedOrder,
          true,
        );
        await hub.close();
      });

      it('returns the explicitly configured adapter', async () => {
        const { MemoryPubSubAdapter } = await import('./pubsub/mod.ts');
        const adapter = new MemoryPubSubAdapter();
        const hub = new Server({ pubsub: adapter });
        asserts.assertStrictEquals(hub.adapter, adapter);
        await hub.close();
      });
    });

    // =========================================================================
    // Connection iteration
    // =========================================================================

    describe('connections', () => {
      it('returns a snapshot of currently open connections', async () => {
        const hub = new Server();
        const a = new MockWs();
        const b = new MockWs();
        await open(hub, a);
        await open(hub, b);
        asserts.assertStrictEquals(hub.connections.length, 2);
        await close(hub, a);
        asserts.assertStrictEquals(hub.connections.length, 1);
        await hub.close();
      });
    });

    // =========================================================================
    // Lifecycle
    // =========================================================================

    // =========================================================================
    // Backpressure observation
    // =========================================================================

    describe('backpressure', () => {
      it('fires onBackpressure when bufferedAmount exceeds threshold after a Server reply', async () => {
        // Regression test for a wiring bug: Server._send used to call
        // ws.send() directly without invoking the underlying WSS's
        // backpressure check, so the configured hook never fired for
        // any Server-originated frame.
        const events: number[] = [];
        const hub = new Server({
          backpressureThreshold: 100,
          onBackpressure: (_ws, buffered) => {
            events.push(buffered);
          },
        });
        hub.command('ping', undefined, () => 'pong');

        const ws = new MockWs();
        await open(hub, ws);
        ws.bufferedAmount = 500;
        await send(
          hub,
          ws,
          encodeInbound({ id: 'a1', type: 'cmd', cmd: 'ping' }),
        );

        asserts.assertEquals(events, [500]);
        await close(hub, ws);
      });

      it('does not fire below threshold', async () => {
        const events: number[] = [];
        const hub = new Server({
          backpressureThreshold: 1000,
          onBackpressure: (_ws, buffered) => {
            events.push(buffered);
          },
        });
        hub.command('ping', undefined, () => 'pong');

        const ws = new MockWs();
        await open(hub, ws);
        ws.bufferedAmount = 200;
        await send(
          hub,
          ws,
          encodeInbound({ id: 'a1', type: 'cmd', cmd: 'ping' }),
        );

        asserts.assertEquals(events, []);
        await close(hub, ws);
      });

      it('does not fire when threshold is unset', async () => {
        const events: number[] = [];
        const hub = new Server({
          onBackpressure: (_ws, buffered) => {
            events.push(buffered);
          },
        });
        hub.command('ping', undefined, () => 'pong');

        const ws = new MockWs();
        await open(hub, ws);
        ws.bufferedAmount = 1_000_000; // huge — but threshold unset
        await send(
          hub,
          ws,
          encodeInbound({ id: 'a1', type: 'cmd', cmd: 'ping' }),
        );

        asserts.assertEquals(events, []);
        await close(hub, ws);
      });
    });

    // =========================================================================
    // Close
    // =========================================================================

    describe('close()', () => {
      it('is idempotent', async () => {
        const hub = new Server();
        await hub.close();
        await hub.close();
      });

      it('rejects use/command/channel after close', async () => {
        const hub = new Server();
        await hub.close();
        asserts.assertThrows(
          () => hub.use(async (_, next) => await next()),
          Error,
          'closed',
        );
        asserts.assertThrows(
          () => hub.command('x', undefined, () => 1),
          Error,
          'closed',
        );
        asserts.assertThrows(
          () => hub.channel('x', {}),
          Error,
          'closed',
        );
      });

      it('mounted mode: refuses connections opened after close()', async () => {
        // Regression: in mounted mode the outer WebServer keeps upgrading
        // connections after close() — the primitive's close() only flips a
        // flag it never consults on open. A late connection used to be
        // accepted and given connection state; it must now be refused
        // (socket closed on open).
        const hub = new Server();
        await hub.close();
        const ws = new MockWs();
        await open(hub, ws);
        asserts.assertStrictEquals(ws.closed, true);
      });

      it('mounted mode: does not serve commands after close()', async () => {
        // A frame arriving on an already-open socket after close() used to
        // be dispatched and answered normally. It must not be served — the
        // socket is closed instead of the command running.
        const hub = new Server();
        hub.command('echo', undefined, () => 'pong');
        const ws = new MockWs();
        await open(hub, ws);
        await hub.close();
        ws.sent.length = 0;
        ws.closed = false;
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'cmd', cmd: 'echo' }),
        );
        asserts.assertEquals(ws.sent, []);
        asserts.assertStrictEquals(ws.closed, true);
      });

      it('mounted mode: does not hang a subscribe after close()', async () => {
        // For a channel without `authorize`, a post-close `sub` reached the
        // now-closed pub/sub adapter, threw `subscribe after close()`, was
        // swallowed by the primitive, and left the client hanging with no
        // reply. It must be refused (socket closed), never dispatched.
        const hub = new Server();
        hub.channel('topic', {});
        const ws = new MockWs();
        await open(hub, ws);
        await hub.close();
        ws.sent.length = 0;
        ws.closed = false;
        await send(
          hub,
          ws,
          encodeInbound({ id: '1', type: 'sub', channel: 'topic' }),
        );
        asserts.assertEquals(ws.sent, []);
        asserts.assertStrictEquals(ws.closed, true);
      });
    });
  },
});

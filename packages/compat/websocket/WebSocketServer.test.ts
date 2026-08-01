/**
 * @fileoverview Tests for the WebSocketServer primitive — middleware,
 * lifecycle hooks, codec, broadcast, connection iteration. Drives the
 * internal handlers directly with a mock WebSocket so we don't need a
 * real network connection.
 */

import { describe, it } from '../test.ts';
import { WebSocketServer } from './WebSocketServer.ts';
import { JsonCodec } from './codecs.ts';
import type {
  ServerWebSocket,
  WebSocketUpgradeContext,
} from '../webserver/types/mod.ts';
import * as asserts from '@std/asserts';

class MockWs<T = unknown> {
  sent: (string | Uint8Array | ArrayBuffer)[] = [];
  closed = false;
  bufferedAmount = 0;

  constructor(public data: T = undefined as unknown as T) {}

  send(payload: string | Uint8Array | ArrayBuffer): void {
    this.sent.push(payload);
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
  readonly protocol = '';
  readonly remoteAddress: string | undefined = '127.0.0.1';

  asServerWebSocket(): ServerWebSocket<T> {
    return this as unknown as ServerWebSocket<T>;
  }
}

const upgradeContext: WebSocketUpgradeContext = {
  request: new Request('http://localhost/'),
  remoteAddress: '127.0.0.1',
  remotePort: 0,
};

describe({
  name: 'compat.websocket.WebSocketServer',
  fn: () => {
    // =========================================================================
    // Codec / message flow
    // =========================================================================

    describe('codec + onMessage', () => {
      it('default StringCodec passes text through', async () => {
        const wss = new WebSocketServer();
        let received: string | null = null;
        wss.onMessage((ctx) => {
          received = ctx.message;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'hello');
        asserts.assertStrictEquals(received, 'hello');
        await wss.close();
      });

      it('JsonCodec parses incoming JSON', async () => {
        const wss = new WebSocketServer({ codec: JsonCodec });
        let received: unknown;
        wss.onMessage((ctx) => {
          received = ctx.message;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(
          ws.asServerWebSocket(),
          '{"hello":"world"}',
        );
        asserts.assertEquals(received, { hello: 'world' });
        await wss.close();
      });

      it('onDecodeError fires when codec returns null', async () => {
        const wss = new WebSocketServer({ codec: JsonCodec });
        const errors: unknown[] = [];
        wss.onDecodeError((_ws, raw) => {
          errors.push(raw);
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'not json');
        asserts.assertEquals(errors, ['not json']);
        await wss.close();
      });

      it('drops malformed input silently when no onDecodeError', async () => {
        const wss = new WebSocketServer({ codec: JsonCodec });
        let onMsgCount = 0;
        wss.onMessage(() => {
          onMsgCount++;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'not json');
        asserts.assertStrictEquals(onMsgCount, 0);
        await wss.close();
      });
    });

    // =========================================================================
    // Middleware
    // =========================================================================

    describe('middleware', () => {
      it('runs in registration order, wrapping onMessage', async () => {
        const wss = new WebSocketServer();
        const order: string[] = [];
        wss.use(async (_ctx, next) => {
          order.push('a:before');
          await next();
          order.push('a:after');
        });
        wss.use(async (_ctx, next) => {
          order.push('b:before');
          await next();
          order.push('b:after');
        });
        wss.onMessage(() => {
          order.push('handler');
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'x');
        asserts.assertEquals(order, [
          'a:before',
          'b:before',
          'handler',
          'b:after',
          'a:after',
        ]);
        await wss.close();
      });

      it('short-circuits when middleware skips next()', async () => {
        const wss = new WebSocketServer();
        let handlerCalled = false;
        wss.use(async (_ctx, _next) => {
          // Skip
        });
        wss.onMessage(() => {
          handlerCalled = true;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'x');
        asserts.assertFalse(handlerCalled);
        await wss.close();
      });

      it('shares ctx.state across middleware and onMessage', async () => {
        const wss = new WebSocketServer();
        wss.use(async (ctx, next) => {
          ctx.state.tag = 'set-by-mw';
          await next();
        });
        let observed: unknown;
        wss.onMessage((ctx) => {
          observed = ctx.state.tag;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'x');
        asserts.assertStrictEquals(observed, 'set-by-mw');
        await wss.close();
      });

      it('routes errors to onError', async () => {
        const wss = new WebSocketServer();
        const seen: unknown[] = [];
        wss.onError((err) => seen.push(err));
        wss.onMessage(() => {
          throw new Error('boom');
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'x');
        asserts.assertStrictEquals(seen.length, 1);
        asserts.assert(seen[0] instanceof Error);
        await wss.close();
      });
    });

    // =========================================================================
    // Lifecycle hooks
    // =========================================================================

    describe('lifecycle hooks', () => {
      it('fires onOpen and onClose', async () => {
        const wss = new WebSocketServer();
        const events: string[] = [];
        wss.onOpen(() => {
          events.push('open');
        });
        wss.onClose(() => {
          events.push('close');
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleClose(ws.asServerWebSocket(), 1000, '');
        asserts.assertEquals(events, ['open', 'close']);
        await wss.close();
      });
    });

    // =========================================================================
    // Connection tracking + broadcast
    // =========================================================================

    describe('connections + broadcast', () => {
      it('tracks open connections', async () => {
        const wss = new WebSocketServer();
        const a = new MockWs();
        const b = new MockWs();
        await wss.__handleOpen(a.asServerWebSocket(), upgradeContext);
        await wss.__handleOpen(b.asServerWebSocket(), upgradeContext);
        asserts.assertStrictEquals(wss.connections.length, 2);
        await wss.__handleClose(a.asServerWebSocket(), 1000, '');
        asserts.assertStrictEquals(wss.connections.length, 1);
        await wss.close();
      });

      it('broadcast sends encoded message to every connection', async () => {
        const wss = new WebSocketServer();
        const a = new MockWs();
        const b = new MockWs();
        await wss.__handleOpen(a.asServerWebSocket(), upgradeContext);
        await wss.__handleOpen(b.asServerWebSocket(), upgradeContext);
        wss.broadcast('hello');
        asserts.assertEquals(a.sent, ['hello']);
        asserts.assertEquals(b.sent, ['hello']);
        await wss.close();
      });

      it('broadcast with JsonCodec encodes once', async () => {
        const wss = new WebSocketServer({ codec: JsonCodec });
        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        wss.broadcast({ x: 1 });
        asserts.assertEquals(ws.sent, ['{"x":1}']);
        await wss.close();
      });

      it('broadcast with no connections is a no-op', async () => {
        const wss = new WebSocketServer();
        wss.broadcast('hello'); // does not throw
        await wss.close();
      });

      it('send() encodes via codec and writes to a single ws', async () => {
        const wss = new WebSocketServer({ codec: JsonCodec });
        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        wss.send(ws.asServerWebSocket(), { x: 1 });
        asserts.assertEquals(ws.sent, ['{"x":1}']);
        await wss.close();
      });
    });

    // =========================================================================
    // Frame size limit
    // =========================================================================

    describe('maxFrameSize', () => {
      it('drops oversized text frames before decode and reports oversize', async () => {
        const wss = new WebSocketServer({ maxFrameSize: 10 });
        const calls: { reason: string; len: number }[] = [];
        wss.onDecodeError((_ws, raw, reason) => {
          calls.push({
            reason,
            len: typeof raw === 'string'
              ? raw.length
              : (raw as Uint8Array).byteLength,
          });
        });
        let onMsgCount = 0;
        wss.onMessage(() => {
          onMsgCount++;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(
          ws.asServerWebSocket(),
          'this string is way longer than ten bytes',
        );
        asserts.assertEquals(calls, [{ reason: 'oversize', len: 40 }]);
        asserts.assertStrictEquals(onMsgCount, 0);
        await wss.close();
      });

      it('drops oversized binary frames', async () => {
        const wss = new WebSocketServer({ maxFrameSize: 4 });
        const reasons: string[] = [];
        wss.onDecodeError((_ws, _raw, reason) => {
          reasons.push(reason);
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(
          ws.asServerWebSocket(),
          new Uint8Array([1, 2, 3, 4, 5]),
        );
        asserts.assertEquals(reasons, ['oversize']);
        await wss.close();
      });

      it('reports malformed (codec returned null) with reason malformed', async () => {
        const wss = new WebSocketServer({ codec: JsonCodec });
        const reasons: string[] = [];
        wss.onDecodeError((_ws, _raw, reason) => {
          reasons.push(reason);
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'not json');
        asserts.assertEquals(reasons, ['malformed']);
        await wss.close();
      });

      it('default 1MB cap allows reasonable payloads', async () => {
        const wss = new WebSocketServer();
        let received = false;
        wss.onMessage(() => {
          received = true;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        await wss.__handleMessage(ws.asServerWebSocket(), 'small payload');
        asserts.assert(received);
        await wss.close();
      });

      it('maxFrameSize: 0 disables the check', async () => {
        const wss = new WebSocketServer({ maxFrameSize: 0 });
        let received = false;
        wss.onMessage(() => {
          received = true;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        // Build a payload larger than the default 1MB
        const huge = 'x'.repeat(2_000_000);
        await wss.__handleMessage(ws.asServerWebSocket(), huge);
        asserts.assert(received);
        await wss.close();
      });
    });

    // =========================================================================
    // Backpressure
    // =========================================================================

    describe('backpressure', () => {
      it('fires onBackpressure when bufferedAmount > threshold after broadcast', async () => {
        const wss = new WebSocketServer({ backpressureThreshold: 100 });
        const events: { buffered: number }[] = [];
        wss.onBackpressure((_ws, buffered) => {
          events.push({ buffered });
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        ws.bufferedAmount = 250;
        wss.broadcast('payload');
        asserts.assertEquals(events, [{ buffered: 250 }]);
        await wss.close();
      });

      it('fires onBackpressure on send() too', async () => {
        const wss = new WebSocketServer({ backpressureThreshold: 100 });
        const events: number[] = [];
        wss.onBackpressure((_ws, buffered) => {
          events.push(buffered);
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        ws.bufferedAmount = 500;
        wss.send(ws.asServerWebSocket(), 'payload');
        asserts.assertEquals(events, [500]);
        await wss.close();
      });

      it('does not fire below threshold', async () => {
        const wss = new WebSocketServer({ backpressureThreshold: 100 });
        const events: number[] = [];
        wss.onBackpressure((_ws, buffered) => {
          events.push(buffered);
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        ws.bufferedAmount = 50;
        wss.broadcast('payload');
        asserts.assertEquals(events, []);
        await wss.close();
      });

      it('observation disabled when threshold unset', async () => {
        const wss = new WebSocketServer();
        let fired = false;
        wss.onBackpressure(() => {
          fired = true;
        });

        const ws = new MockWs();
        await wss.__handleOpen(ws.asServerWebSocket(), upgradeContext);
        ws.bufferedAmount = 999_999;
        wss.broadcast('payload');
        asserts.assertFalse(fired);
        await wss.close();
      });
    });

    // =========================================================================
    // Lifecycle
    // =========================================================================

    describe('close()', () => {
      it('is idempotent', async () => {
        const wss = new WebSocketServer();
        await wss.close();
        await wss.close();
      });

      it('rejects use/onMessage/onOpen/onClose after close', async () => {
        const wss = new WebSocketServer();
        await wss.close();
        asserts.assertThrows(
          () => wss.use(async (_, next) => await next()),
          Error,
          'closed',
        );
        asserts.assertThrows(
          () => wss.onMessage(() => {}),
          Error,
          'closed',
        );
        asserts.assertThrows(
          () => wss.onOpen(() => {}),
          Error,
          'closed',
        );
        asserts.assertThrows(
          () => wss.onClose(() => {}),
          Error,
          'closed',
        );
      });
    });
  },
});

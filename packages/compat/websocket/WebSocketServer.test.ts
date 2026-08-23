/**
 * @fileoverview Tests for the WebSocketServer primitive — middleware,
 * lifecycle hooks, codec, broadcast, connection iteration. Drives the
 * internal handlers directly with a mock WebSocket so we don't need a
 * real network connection.
 */

import { describe, it } from '../test.ts';
import { join } from '../path.ts';
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

// =============================================================================
// handleUpgrade — the listen-free path
// =============================================================================

describe({
  name: 'compat.websocket.WebSocketServer.handleUpgrade',
  fn: () => {
    /** A request that actually looks like a WebSocket upgrade. */
    const upgradeRequest = (url = 'http://localhost/ws') =>
      new Request(url, {
        headers: { upgrade: 'websocket', connection: 'Upgrade' },
      });

    // These three run before any runtime dispatch, so they hold
    // everywhere — including the runtimes that cannot upgrade at all.
    describe('request screening', () => {
      it('answers 426 when the request is not an upgrade', async () => {
        const wss = new WebSocketServer();
        const res = await wss.handleUpgrade(new Request('http://localhost/'));
        asserts.assertEquals(res.status, 426);
        asserts.assertEquals(res.headers.get('upgrade'), 'websocket');
      });

      it('answers 403 and never opens when the hook refuses', async () => {
        let opened = false;
        const wss = new WebSocketServer({ upgrade: () => false });
        wss.onOpen(() => {
          opened = true;
        });
        const res = await wss.handleUpgrade(upgradeRequest());
        asserts.assertEquals(res.status, 403);
        asserts.assertEquals(
          opened,
          false,
          'a refused upgrade must not reach the open handler',
        );
        asserts.assertEquals(wss.connections.length, 0);
      });

      it('passes the request and peer info to the upgrade hook', async () => {
        let seen: { url: string; info: unknown } | null = null;
        const wss = new WebSocketServer({
          upgrade: (request, info) => {
            seen = { url: request.url, info };
            return false; // stop before the runtime dispatch
          },
        });
        await wss.handleUpgrade(upgradeRequest('http://localhost/chat'), {
          remoteAddress: '10.0.0.7',
          remotePort: 4711,
        });
        asserts.assertEquals(seen!.url, 'http://localhost/chat');
        asserts.assertEquals(seen!.info, {
          remoteAddress: '10.0.0.7',
          remotePort: 4711,
        });
      });

      it('defaults peer info to null when the caller has none', async () => {
        let seen: unknown = null;
        const wss = new WebSocketServer({
          upgrade: (_request, info) => {
            seen = info;
            return false;
          },
        });
        await wss.handleUpgrade(upgradeRequest());
        asserts.assertEquals(seen, {
          remoteAddress: null,
          remotePort: null,
        });
      });

      it('rejects once the server is closed', async () => {
        const wss = new WebSocketServer();
        await wss.close();
        await asserts.assertRejects(
          () => wss.handleUpgrade(upgradeRequest()),
          Error,
          'closed',
        );
      });
    });

    it({
      name: 'throws UnsupportedRuntimeError on Bun and Node',
      // Bun's `server.upgrade()` needs the serve object and returns a
      // boolean, and Node upgrades a raw socket — neither can answer
      // with a Response, so the accept path must refuse loudly and
      // point at the wire-ups that do work there.
      deno: false,
      fn: async () => {
        const wss = new WebSocketServer();
        const err = await asserts.assertRejects(
          () => wss.handleUpgrade(upgradeRequest()),
        );
        asserts.assertEquals(
          (err as Error).name,
          'UnsupportedRuntimeError',
          'must be the typed error, not a raw TypeError',
        );
        asserts.assertStringIncludes(
          (err as Error).message,
          'WebSocketServer.handleUpgrade',
        );
        asserts.assertStringIncludes((err as Error).message, 'handlers()');
      },
    });

    it({
      name: 'serves a real connection from inside Deno.serve',
      // Deno is the one runtime where the whole path can run in-process:
      // `Deno.upgradeWebSocket` takes the request and hands back the
      // response, exactly the shape `handleUpgrade` exposes.
      bun: false,
      node: false,
      fn: async () => {
        const port = 9307;
        const events: string[] = [];
        const wss = new WebSocketServer<{ who: string }>({
          upgrade: () => ({
            data: { who: 'tester' },
            headers: { 'x-upgraded-by': 'compat' },
          }),
        });
        wss.use(async (ctx, next) => {
          events.push(`middleware:${ctx.message}`);
          await next();
        });
        wss.onOpen((ws) => {
          events.push(
            `open:${ws.data.who}:ping=${ws.ping()}:buffered=${ws.bufferedAmount}`,
          );
          ws.send('WELCOME');
        });
        wss.onMessage((ctx) => {
          events.push(`message:${ctx.message}`);
          events.push(`connections:${wss.connections.length}`);
          ctx.ws.send(`ECHO:${ctx.message}`);
        });
        wss.onClose((_ws, code, reason) => {
          events.push(`close:${code}:${reason}`);
        });

        const server = Deno.serve(
          { port, hostname: '127.0.0.1', onListen: () => {} },
          (request, info) =>
            wss.handleUpgrade(request, {
              remoteAddress: info.remoteAddr.transport === 'tcp'
                ? info.remoteAddr.hostname
                : null,
            }),
        );

        const received: string[] = [];
        try {
          const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
          await new Promise<void>((resolve) => {
            const bail = setTimeout(resolve, 5000);
            client.onopen = () => client.send('PING');
            client.onmessage = (event) => {
              received.push(String(event.data));
              if (received.length >= 2) client.close(1000, 'done');
            };
            client.onclose = () => {
              clearTimeout(bail);
              resolve();
            };
          });
          // The close handler runs on the server's own turn.
          await new Promise((r) => setTimeout(r, 100));
        } finally {
          await server.shutdown();
        }

        asserts.assertEquals(
          received,
          ['WELCOME', 'ECHO:PING'],
          'the client must receive both the open-time send and the echo',
        );
        asserts.assertEquals(events, [
          'open:tester:ping=false:buffered=0',
          'middleware:PING',
          'message:PING',
          'connections:1',
          'close:1000:done',
        ]);
        asserts.assertEquals(
          wss.connections.length,
          0,
          'the connection must be untracked after close',
        );
      },
    });

    it({
      name: 'drives the same dispatch on a simulated workerd',
      // workerd's shape can't be built in-process — `runtime.ts` latches
      // its globals at import time and this file imported it long ago —
      // so it runs in a child with forged globals and a `WebSocketPair`
      // stand-in. Same idiom as net.test.ts / file.test.ts. Deno-gated
      // because it spawns with `Deno.Command`.
      bun: false,
      node: false,
      fn: async () => {
        const script = `// deno-lint-ignore-file no-explicit-any
const g = globalThis as any;
delete g.Deno;
Object.defineProperty(g, 'process', {
  value: { versions: { node: '22.11.0' }, getBuiltinModule: () => undefined },
  configurable: true,
});
Object.defineProperty(g, 'navigator', {
  value: { userAgent: 'Cloudflare-Workers' },
  configurable: true,
});

// Stand-in for workerd's WebSocketPair: two linked browser-style ends.
// Deliberately carries NO \`bufferedAmount\` — workerd doesn't implement
// it, and the adapter has to cope.
class FakePeer extends EventTarget {
  readyState = 0;
  protocol = '';
  accepted = false;
  peer!: FakePeer;
  accept() {
    this.accepted = true;
    this.readyState = 1;
  }
  send(data: unknown) {
    this.peer.dispatchEvent(new MessageEvent('message', { data }));
  }
  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
    this.peer.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
}
g.WebSocketPair = function () {
  const client = new FakePeer();
  const server = new FakePeer();
  client.peer = server;
  server.peer = client;
  g.__pair = { client, server };
  return { 0: client, 1: server };
};

const { RUNTIME } = await import('../runtime.ts');
const { WebSocketServer } = await import('../websocket/WebSocketServer.ts');

const events: string[] = [];
const wss = new WebSocketServer<{ who: string }>({
  upgrade: () => ({
    data: { who: 'worker' },
    headers: { 'x-upgraded-by': 'compat' },
  }),
});
wss.use(async (ctx: any, next: any) => {
  events.push('middleware:' + ctx.message);
  await next();
});
wss.onOpen((ws: any) => {
  events.push(
    'open:' + ws.data.who + ':ping=' + ws.ping() +
      ':buffered=' + ws.bufferedAmount + ':ready=' + ws.readyState,
  );
  ws.send('WELCOME');
});
wss.onMessage((ctx: any) => {
  events.push('message:' + ctx.message);
  events.push('connections:' + wss.connections.length);
  ctx.ws.send('ECHO:' + ctx.message);
});
wss.onClose((_ws: any, code: number, reason: string) => {
  events.push('close:' + code + ':' + reason);
});

const clientFrames: string[] = [];
const response = await wss.handleUpgrade(
  new Request('http://localhost/ws', {
    headers: { upgrade: 'websocket', connection: 'Upgrade' },
  }),
  { remoteAddress: '10.1.2.3' },
);
g.__pair.client.addEventListener('message', (e: MessageEvent) => {
  clientFrames.push(String(e.data));
});

g.__pair.client.send('PING');
await new Promise((r) => setTimeout(r, 10));
g.__pair.client.close(1001, 'going away');
await new Promise((r) => setTimeout(r, 10));

console.log(JSON.stringify({
  runtime: RUNTIME,
  status: response.status,
  header: response.headers.get('x-upgraded-by'),
  accepted: g.__pair.server.accepted,
  events,
  clientFrames,
  connectionsAfterClose: wss.connections.length,
}));
`;
        // `fixtures/` is git-ignored and excluded from fmt/lint/test.
        const scriptPath = join(
          import.meta.dirname!,
          '..',
          'fixtures',
          `workers-ws-${crypto.randomUUID()}.ts`,
        );
        await Deno.writeTextFile(scriptPath, script);
        let out;
        try {
          out = await new Deno.Command(Deno.execPath(), {
            args: ['run', '--allow-read', scriptPath],
            stdout: 'piped',
            stderr: 'piped',
          }).output();
        } finally {
          await Deno.remove(scriptPath);
        }
        const stderr = new TextDecoder().decode(out.stderr);
        asserts.assertEquals(out.code, 0, `child process failed:\n${stderr}`);
        const result = JSON.parse(new TextDecoder().decode(out.stdout));

        asserts.assertEquals(result.runtime, 'WORKERS');
        asserts.assertEquals(
          result.status,
          101,
          'the upgrade response must be a 101',
        );
        asserts.assertEquals(
          result.header,
          'compat',
          'headers from the upgrade decision must reach the response',
        );
        asserts.assertEquals(
          result.accepted,
          true,
          'the server end must be accept()ed or no events ever fire',
        );
        // `open` runs before the response is returned — workerd gives the
        // server end no open event, so the handler is called directly.
        // `buffered=0` is the adapter coping with workerd having no
        // `bufferedAmount` at all.
        asserts.assertEquals(result.events, [
          'open:worker:ping=false:buffered=0:ready=1',
          'middleware:PING',
          'message:PING',
          'connections:1',
          'close:1001:going away',
        ]);
        asserts.assertEquals(
          result.clientFrames,
          ['ECHO:PING'],
          'the echo must reach the client end of the pair',
        );
        asserts.assertEquals(result.connectionsAfterClose, 0);
      },
    });
  },
});

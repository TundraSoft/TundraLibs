/**
 * @fileoverview End-to-end tests for Server using a real WebSocket
 * client connecting over TCP. Complements the mock-based unit tests
 * in `Server.test.ts` by verifying the actual wire path:
 * `hub.listen()` → real client → real socket → handler → frame back
 * over the wire → client decodes.
 *
 * Each test gets its own port + Server instance and tears
 * everything down on completion to keep them isolated.
 */

import { describe, it } from '@tundralibs/compat/test';
import { Server } from './Server.ts';
import type {
  InboundFrame,
  MessageFrame,
  OutboundFrame,
  ResultFrame,
} from './types/mod.ts';
import * as asserts from '@std/asserts';

// =============================================================================
// Port management
// =============================================================================

let __port = 29950;
const nextPort = (): number => __port++;

// =============================================================================
// Wire helpers — drive a real WebSocket client
// =============================================================================

const waitForOpen = (ws: WebSocket, timeoutMs = 3000): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('WebSocket failed to open'));
    };
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('WebSocket open timeout'));
    }, timeoutMs);
  });

const sendAndAwait = (
  ws: WebSocket,
  frame: InboundFrame,
  timeoutMs = 3000,
): Promise<OutboundFrame> =>
  new Promise<OutboundFrame>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
    };
    const onMessage = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as OutboundFrame;
        if ('id' in parsed && parsed.id === frame.id) {
          cleanup();
          resolve(parsed);
        }
      } catch {
        // Skip non-JSON
      }
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify(frame));
    timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timeout waiting for response to frame id=${frame.id}`,
        ),
      );
    }, timeoutMs);
  });

const collectMessages = (
  ws: WebSocket,
  channel: string,
  count: number,
  timeoutMs = 3000,
): Promise<MessageFrame[]> =>
  new Promise<MessageFrame[]>((resolve, reject) => {
    const messages: MessageFrame[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
    };
    const onMessage = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as OutboundFrame;
        if (parsed.type === 'msg' && parsed.channel === channel) {
          messages.push(parsed);
          if (messages.length >= count) {
            cleanup();
            resolve(messages);
          }
        }
      } catch {
        // Skip
      }
    };
    ws.addEventListener('message', onMessage);
    timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timeout waiting for ${count} msg(s) on ${channel}; got ${messages.length}`,
        ),
      );
    }, timeoutMs);
  });

const closeSocket = (ws: WebSocket): Promise<void> =>
  new Promise((resolve) => {
    if (
      ws.readyState === WebSocket.CLOSED ||
      ws.readyState === WebSocket.CLOSING
    ) {
      resolve();
      return;
    }
    ws.addEventListener('close', () => resolve(), { once: true });
    ws.close();
  });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// =============================================================================
// Tests
// =============================================================================

describe({
  name: 'rpc.Server.live',
  fn: () => {
    describe('command flow', () => {
      it('round-trips a cmd through a real client', async () => {
        const hub = new Server();
        hub.command('echo', undefined, (ctx) => ({
          echoed: ctx.payload,
        }));
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const result = await sendAndAwait(ws, {
            id: 'r1',
            type: 'cmd',
            cmd: 'echo',
            payload: 'hello',
          }) as ResultFrame;
          asserts.assert(result.ok);
          asserts.assertEquals(
            (result as { data: unknown }).data,
            { echoed: 'hello' },
          );
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });

      it('runs validator + middleware on real traffic', async () => {
        const hub = new Server();
        const order: string[] = [];
        hub.use(async (_ctx, next) => {
          order.push('mw1:before');
          await next();
          order.push('mw1:after');
        });
        hub.command(
          'add',
          (input) => {
            if (typeof input !== 'object' || input === null) {
              throw new Error('expected object');
            }
            const a = (input as { a: unknown }).a;
            const b = (input as { b: unknown }).b;
            if (typeof a !== 'number' || typeof b !== 'number') {
              throw new Error('a and b must be numbers');
            }
            return { a, b };
          },
          (ctx) => {
            order.push('handler');
            return ctx.payload.a + ctx.payload.b;
          },
        );
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const result = await sendAndAwait(ws, {
            id: 'r1',
            type: 'cmd',
            cmd: 'add',
            payload: { a: 2, b: 3 },
          }) as ResultFrame;
          asserts.assert(result.ok);
          asserts.assertEquals(
            (result as { data: unknown }).data,
            5,
          );
          asserts.assertEquals(order, [
            'mw1:before',
            'handler',
            'mw1:after',
          ]);
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });

      it('returns VALIDATION error on bad payload', async () => {
        const hub = new Server();
        hub.command(
          'must-be-string',
          (input) => {
            if (typeof input !== 'string') throw new Error('not a string');
            return input;
          },
          (ctx) => ctx.payload,
        );
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const result = await sendAndAwait(ws, {
            id: 'r1',
            type: 'cmd',
            cmd: 'must-be-string',
            payload: 42,
          }) as ResultFrame;
          asserts.assertFalse(result.ok);
          if (result.ok) return;
          asserts.assertEquals(result.error.code, 'VALIDATION');
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });

      it('returns UNKNOWN_COMMAND for unregistered command', async () => {
        const hub = new Server();
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const result = await sendAndAwait(ws, {
            id: 'r1',
            type: 'cmd',
            cmd: 'no-such-cmd',
          }) as ResultFrame;
          asserts.assertFalse(result.ok);
          if (result.ok) return;
          asserts.assertEquals(result.error.code, 'UNKNOWN_COMMAND');
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });
    });

    describe('pub/sub flow', () => {
      it('subscribe + server publish reaches the client', async () => {
        const hub = new Server();
        hub.channel('news', {});
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const sub = await sendAndAwait(ws, {
            id: 's1',
            type: 'sub',
            channel: 'news',
          });
          asserts.assertStrictEquals(sub.type, 'subscribed');

          const collected = collectMessages(ws, 'news', 2);
          await sleep(50);
          await hub.publish('news', { headline: 'first' });
          await hub.publish('news', { headline: 'second' });
          const messages = await collected;
          asserts.assertEquals(messages.length, 2);
          asserts.assertEquals(
            messages[0]!.data,
            { headline: 'first' },
          );
          asserts.assertEquals(
            messages[1]!.data,
            { headline: 'second' },
          );
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });

      it('broadcast reaches multiple clients', async () => {
        const hub = new Server();
        hub.channel('news', {});
        const port = nextPort();
        await hub.listen({ port });

        const a = new WebSocket(`ws://localhost:${port}/`);
        const b = new WebSocket(`ws://localhost:${port}/`);
        try {
          await Promise.all([waitForOpen(a), waitForOpen(b)]);
          await Promise.all([
            sendAndAwait(a, { id: 's1', type: 'sub', channel: 'news' }),
            sendAndAwait(b, { id: 's1', type: 'sub', channel: 'news' }),
          ]);
          const collectedA = collectMessages(a, 'news', 1);
          const collectedB = collectMessages(b, 'news', 1);
          await sleep(50);
          await hub.publish('news', { headline: 'broadcast' });
          const [msgsA, msgsB] = await Promise.all([
            collectedA,
            collectedB,
          ]);
          asserts.assertEquals(msgsA[0]!.data, { headline: 'broadcast' });
          asserts.assertEquals(msgsB[0]!.data, { headline: 'broadcast' });
        } finally {
          await Promise.all([closeSocket(a), closeSocket(b)]);
          await hub.close();
        }
      });

      it('unsubscribe stops further deliveries', async () => {
        const hub = new Server();
        hub.channel('news', {});
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          await sendAndAwait(ws, {
            id: 's1',
            type: 'sub',
            channel: 'news',
          });
          const firstCollected = collectMessages(ws, 'news', 1);
          await sleep(50);
          await hub.publish('news', 'first');
          await firstCollected;

          await sendAndAwait(ws, {
            id: 'u1',
            type: 'unsub',
            channel: 'news',
          });

          await sleep(50);
          await hub.publish('news', 'after-unsub');
          await sleep(150);

          let lateMsgCount = 0;
          const peek = (ev: MessageEvent) => {
            try {
              const f = JSON.parse(String(ev.data)) as OutboundFrame;
              if (f.type === 'msg' && f.channel === 'news') lateMsgCount++;
            } catch {
              // skip
            }
          };
          ws.addEventListener('message', peek);
          await sleep(50);
          ws.removeEventListener('message', peek);
          asserts.assertStrictEquals(lateMsgCount, 0);
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });

      it('client publish via onPublish round-trips', async () => {
        const hub = new Server();
        const seen: unknown[] = [];
        hub.channel('echo-room', {
          onPublish: async (ctx, payload) => {
            seen.push(payload);
            await hub.publish(ctx.channel, payload);
          },
        });
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          await sendAndAwait(ws, {
            id: 's1',
            type: 'sub',
            channel: 'echo-room',
          });
          const collected = collectMessages(ws, 'echo-room', 1);
          await sleep(50);
          const ack = await sendAndAwait(ws, {
            id: 'p1',
            type: 'pub',
            channel: 'echo-room',
            payload: 'hello',
          }) as ResultFrame;
          asserts.assert(ack.ok);
          const [msg] = await collected;
          asserts.assertEquals(msg!.data, 'hello');
          asserts.assertEquals(seen, ['hello']);
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });

      it('connection close cleans up subscriptions', async () => {
        const hub = new Server();
        let unsubFired = 0;
        hub.channel('cleanup-test', {
          onUnsubscribe: () => {
            unsubFired++;
          },
        });
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          await sendAndAwait(ws, {
            id: 's1',
            type: 'sub',
            channel: 'cleanup-test',
          });
          await closeSocket(ws);
          await sleep(50);
          asserts.assertStrictEquals(unsubFired, 1);
        } finally {
          await hub.close();
        }
      });
    });

    describe('error frames over the wire', () => {
      it('garbage input gets a BAD_FORMAT error frame', async () => {
        const hub = new Server();
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const errorFrame = await new Promise<OutboundFrame>(
            (resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('timeout')),
                3000,
              );
              ws.addEventListener('message', (ev) => {
                clearTimeout(timer);
                resolve(JSON.parse(String(ev.data)) as OutboundFrame);
              }, { once: true });
              ws.send('this is not json');
            },
          );
          asserts.assertStrictEquals(errorFrame.type, 'error');
          asserts.assertStrictEquals(
            (errorFrame as { code: string }).code,
            'BAD_FORMAT',
          );
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });

      it('a malformed-but-id-carrying frame gets a correlated error (fail fast)', async () => {
        // End-to-end proof that the client can fail fast. `sendAndAwait`
        // resolves ONLY on a reply whose `id` matches the frame it sent,
        // so it is a stand-in for the Client's id-correlation: pre-fix the
        // server answered a malformed frame with an id-less BAD_FORMAT
        // error, `sendAndAwait` never matched, and it rejected with a 3s
        // timeout (the exact hang the doc implies is avoidable). Post-fix
        // the error frame carries the recovered id, so this resolves
        // immediately.
        const hub = new Server();
        const port = nextPort();
        await hub.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          // Well-formed JSON, valid id, unknown type → BAD_FORMAT. Cast
          // through `unknown` because it is intentionally not a valid
          // InboundFrame — the whole point is an id-carrying malformed one.
          const errorFrame = await sendAndAwait(
            ws,
            { id: 'r1', type: 'weird' } as unknown as InboundFrame,
          );
          asserts.assertStrictEquals(errorFrame.type, 'error');
          asserts.assertStrictEquals(
            (errorFrame as { id?: string }).id,
            'r1',
          );
          asserts.assertStrictEquals(
            (errorFrame as { code: string }).code,
            'BAD_FORMAT',
          );
        } finally {
          await closeSocket(ws);
          await hub.close();
        }
      });
    });
  },
});

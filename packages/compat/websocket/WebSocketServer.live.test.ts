/**
 * @fileoverview End-to-end tests for the WebSocketServer primitive
 * using a real WebSocket client connecting over TCP. Verifies the
 * actual wire path: `wss.listen()` → real client → real socket →
 * onMessage → broadcast → client decodes.
 */

import { describe, it } from '../test.ts';
import { WebSocketServer } from './WebSocketServer.ts';
import { JsonCodec } from './codecs.ts';
import * as asserts from '@std/asserts';

let __port = 29800;
const nextPort = (): number => __port++;

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

const waitForMessage = (
  ws: WebSocket,
  timeoutMs = 3000,
): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for message')),
      timeoutMs,
    );
    ws.addEventListener('message', (ev) => {
      clearTimeout(timer);
      resolve(String(ev.data));
    }, { once: true });
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

describe({
  name: 'compat.websocket.WebSocketServer.live',
  fn: () => {
    describe('echo', () => {
      it('round-trips a string message via onMessage', async () => {
        const wss = new WebSocketServer();
        wss.onMessage((ctx) => {
          ctx.ws.send(`echo: ${ctx.message}`);
        });
        const port = nextPort();
        await wss.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const recv = waitForMessage(ws);
          ws.send('hello');
          asserts.assertStrictEquals(await recv, 'echo: hello');
        } finally {
          await closeSocket(ws);
          await wss.close();
        }
      });

      it('JsonCodec round-trips an object', async () => {
        const wss = new WebSocketServer({ codec: JsonCodec });
        wss.onMessage((ctx) => {
          wss.broadcast({ received: ctx.message });
        });
        const port = nextPort();
        await wss.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          const recv = waitForMessage(ws);
          ws.send(JSON.stringify({ hello: 'world' }));
          asserts.assertEquals(JSON.parse(await recv), {
            received: { hello: 'world' },
          });
        } finally {
          await closeSocket(ws);
          await wss.close();
        }
      });
    });

    describe('broadcast', () => {
      it('reaches every connection', async () => {
        const wss = new WebSocketServer();
        const port = nextPort();
        await wss.listen({ port });

        const a = new WebSocket(`ws://localhost:${port}/`);
        const b = new WebSocket(`ws://localhost:${port}/`);
        try {
          await Promise.all([waitForOpen(a), waitForOpen(b)]);
          // Give the server a tick to register both connections.
          await sleep(50);
          const recvA = waitForMessage(a);
          const recvB = waitForMessage(b);
          wss.broadcast('hello-all');
          asserts.assertStrictEquals(await recvA, 'hello-all');
          asserts.assertStrictEquals(await recvB, 'hello-all');
        } finally {
          await Promise.all([closeSocket(a), closeSocket(b)]);
          await wss.close();
        }
      });
    });

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
        const port = nextPort();
        await wss.listen({ port });

        const ws = new WebSocket(`ws://localhost:${port}/`);
        try {
          await waitForOpen(ws);
          await sleep(50);
          asserts.assertEquals(events, ['open']);
          await closeSocket(ws);
          await sleep(50);
          asserts.assertEquals(events, ['open', 'close']);
        } finally {
          await wss.close();
        }
      });
    });
  },
});

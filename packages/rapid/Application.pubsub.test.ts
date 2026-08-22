/**
 * @fileoverview WebSocket pub/sub — `app.channel` declares a channel,
 * `app.publish` / `ctx.publish` push to its subscribers over the same
 * `/ws` socket. A channel alone (no socket commands) still mounts the
 * listener.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Client } from '@tundralibs/rpc';
import { Application } from './Application.ts';
import { RapidError } from './errors/mod.ts';

const make = (name: string) =>
  Application.initialize({
    name,
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-pubsub-test' },
  });

const nextMessage = <T>(): [Promise<T>, (v: T) => void] => {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => {
    resolve = r;
  });
  return [p, resolve];
};

describe('rapid.Application pub/sub', () => {
  it('a channel-only app mounts /ws; app.publish reaches a subscriber', async () => {
    const app = await make('pubsub-basic');
    app.channel('news'); // no socket() commands — the channel alone mounts the listener
    await app.start();
    const ws = new Client({
      url: `ws://localhost:${app.port}/ws`,
      reconnect: { enabled: false },
    });
    try {
      await ws.connect();
      const [got, resolve] = nextMessage<{ headline: string }>();
      await ws.subscribe('news', (m) => resolve(m as { headline: string }));
      await app.publish('news', { headline: 'rapid ships pub/sub' });
      asserts.assertEquals(await got, { headline: 'rapid ships pub/sub' });
    } finally {
      await ws.close();
      await app.stop();
    }
  });

  it('ctx.publish from an HTTP handler reaches a socket subscriber', async () => {
    const app = await make('pubsub-ctx');
    app.channel('events');
    app.get('/emit', (ctx) => {
      void ctx.publish('events', { at: 'handler' });
      return { content: { ok: true } };
    });
    await app.start();
    const ws = new Client({
      url: `ws://localhost:${app.port}/ws`,
      reconnect: { enabled: false },
    });
    try {
      await ws.connect();
      const [got, resolve] = nextMessage<{ at: string }>();
      await ws.subscribe('events', (m) => resolve(m as { at: string }));
      const r = await fetch(`http://localhost:${app.port}/emit`);
      asserts.assertEquals((await r.json()).ok, true);
      asserts.assertEquals(await got, { at: 'handler' });
    } finally {
      await ws.close();
      await app.stop();
    }
  });

  it('authorize gates subscription — a denied client cannot subscribe', async () => {
    const app = await make('pubsub-authz');
    app.channel('secret', { authorize: (conn) => conn.query.token === 'ok' });
    await app.start();
    const denied = new Client({
      url: `ws://localhost:${app.port}/ws`,
      reconnect: { enabled: false },
    });
    try {
      await denied.connect();
      await asserts.assertRejects(() => denied.subscribe('secret', () => {}));
    } finally {
      await denied.close();
      await app.stop();
    }
  });

  it('a duplicate channel name is refused; publish before start is a no-op', async () => {
    const app = await make('pubsub-guards');
    app.channel('a');
    asserts.assertThrows(
      () => app.channel('a'),
      RapidError,
      'already declared',
    );
    asserts.assertThrows(() => app.channel(''), RapidError, 'non-empty');
    await app.publish('a', {}); // no listener yet → resolves, no throw
    await app.stop();
  });
});

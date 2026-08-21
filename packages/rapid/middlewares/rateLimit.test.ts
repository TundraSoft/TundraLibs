/**
 * @fileoverview rateLimit — budgets, headers, keying (custom + the
 * job exemption), window expiry, and factory validation.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { rateLimit } from './rateLimit.ts';
import { memoryStore, type Store } from './store.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('rapid.middlewares.rateLimit', () => {
  it('factory rejects non-positive budgets loudly', () => {
    asserts.assertThrows(() => rateLimit({ max: 0 }), RapidError);
    asserts.assertThrows(() => rateLimit({ windowMs: -1 }), RapidError);
  });

  it('over-budget HTTP requests get 429 + the full header set', async () => {
    const app = new Application({ name: 'rlim', server: { port: 0 } });
    app.use(rateLimit({ max: 2, windowMs: 60_000 }));
    app.get('/r', () => ({ content: 'ok' }));
    await app.start();
    const base = `http://localhost:${app.port}`;
    try {
      const first = await fetch(`${base}/r`);
      asserts.assertEquals(first.status, 200);
      asserts.assertEquals(first.headers.get('x-ratelimit-limit'), '2');
      asserts.assertEquals(first.headers.get('x-ratelimit-remaining'), '1');
      await first.text();
      await (await fetch(`${base}/r`)).text();
      const third = await fetch(`${base}/r`);
      asserts.assertEquals(third.status, 429);
      asserts.assertEquals((await third.json()).code, 'RAPID_RATE_LIMITED');
      asserts.assertEquals(third.headers.get('x-ratelimit-remaining'), '0');
      asserts.assert(Number(third.headers.get('retry-after')) >= 1);
    } finally {
      await app.stop();
    }
  });

  it('a custom key partitions budgets; null exempts', async () => {
    const app = new Application({ name: 'rlk', server: { port: 0 } });
    app.use(rateLimit({
      max: 1,
      key: (ctx) => ctx.type === 'HTTP' ? ctx.headers.get('x-tenant') : null,
    }));
    app.get('/r', () => ({ content: 'ok' }));
    await app.start();
    const base = `http://localhost:${app.port}`;
    const get = (tenant: string) =>
      fetch(`${base}/r`, { headers: { 'x-tenant': tenant } });
    try {
      asserts.assertEquals((await get('a')).status, 200);
      asserts.assertEquals((await get('b')).status, 200); // separate budget
      asserts.assertEquals((await get('a')).status, 429); // a is spent
    } finally {
      await app.stop();
    }
  });

  it('jobs are exempt by default — schedulers never rate limit', async () => {
    const app = new Application({ name: 'rlj', server: { enabled: false } });
    app.use(rateLimit({ max: 1 }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    for (let i = 0; i < 4; i++) {
      asserts.assertEquals((await app.triggerJob('j')).status, 200);
    }
  });

  it('memoryStore: get/set round-trip with TTL expiry', async () => {
    const store = memoryStore<{ n: number }>();
    asserts.assertEquals(store.get('k'), undefined);
    store.set('k', { n: 1 }, 30);
    asserts.assertEquals(store.get('k'), { n: 1 });
    await sleep(40);
    asserts.assertEquals(store.get('k'), undefined); // expired
  });

  it('memoryStore: set WITHOUT a ttl persists (expiresAt = Infinity)', async () => {
    const store = memoryStore<{ n: number }>();
    store.set('k', { n: 7 }); // no ttl → never expires
    await sleep(20);
    asserts.assertEquals(store.get('k'), { n: 7 }); // still there after a tick
  });

  it('accepts an injected { get, set } store (async, e.g. redis-shaped)', async () => {
    const backing = new Map<string, { count: number; resetAt: number }>();
    const store: Store<{ count: number; resetAt: number }> = {
      get: (k) => Promise.resolve(backing.get(k)),
      set: (k, v) => {
        backing.set(k, v);
        return Promise.resolve();
      },
    };
    const app = new Application({ name: 'rl-store', server: { port: 0 } });
    app.use(rateLimit({ max: 1, windowMs: 10_000, store, key: () => 'k' }));
    app.get('/', () => ({ content: {} }));
    await app.start();
    try {
      asserts.assertEquals(
        (await fetch(`http://localhost:${app.port}/`)).status,
        200,
      );
      const r2 = await fetch(`http://localhost:${app.port}/`);
      asserts.assertEquals(r2.status, 429); // budget of 1 exhausted
      await r2.text();
      asserts.assertEquals(backing.get('k')?.count, 2); // the injected store saw both
    } finally {
      await app.stop();
    }
  });
});

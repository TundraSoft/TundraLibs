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
import { memoryRateLimitHooks, type RateLimitHooks } from './rateLimit.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('rapid.middlewares.rateLimit', () => {
  it('the memory hooks hold at most maxKeys windows — the oldest goes first; the bound is validated', async () => {
    const hooks = memoryRateLimitHooks({ maxKeys: 2 });
    hooks.increment('a', 60);
    hooks.increment('b', 60);
    hooks.increment('c', 60); // evicts 'a'
    asserts.assertEquals((await hooks.increment('a', 60)).count, 1); // evicts 'b'
    asserts.assertEquals((await hooks.increment('c', 60)).count, 2);
    asserts.assertThrows(
      () => memoryRateLimitHooks({ maxKeys: 0 }),
      RapidError,
    );
    asserts.assertThrows(() => rateLimit({ maxKeys: 1.5 }), RapidError);
  });

  it('renames the rate headers on request — the IETF draft names — and hands the hook the window in seconds', async () => {
    const windows: number[] = [];
    const backing = memoryRateLimitHooks();
    const hooks: RateLimitHooks = {
      increment(key, window) {
        windows.push(window);
        return backing.increment(key, window);
      },
    };
    const app = await Application.initialize({
      name: 'rl-names',
      server: { port: 0 },
      logger: { handlers: [] },
    });
    app.use(rateLimit({
      max: 1,
      window: 30,
      hooks,
      key: () => 'k',
      headers: {
        limit: 'RateLimit-Limit',
        remaining: 'RateLimit-Remaining',
        reset: 'RateLimit-Reset',
        retryAfter: 'Retry-After-Seconds',
      },
    }));
    app.get('/', () => ({ content: {} }));
    const ok = await app.fetch(new Request('http://app/'));
    await ok.text();
    asserts.assertEquals(ok.headers.get('ratelimit-limit'), '1');
    asserts.assertEquals(ok.headers.get('ratelimit-remaining'), '0');
    asserts.assert(ok.headers.get('ratelimit-reset'));
    asserts.assertEquals(ok.headers.get('x-ratelimit-limit'), null);
    const over = await app.fetch(new Request('http://app/'));
    await over.text();
    asserts.assertEquals(over.status, 429);
    asserts.assertEquals(over.headers.get('retry-after-seconds'), '30');
    asserts.assertEquals(over.headers.get('retry-after'), null);
    asserts.assertEquals(windows, [30, 30]);
  });

  it('factory rejects non-positive budgets loudly', () => {
    asserts.assertThrows(() => rateLimit({ max: 0 }), RapidError);
    asserts.assertThrows(() => rateLimit({ window: -1 }), RapidError);
    asserts.assertThrows(() => rateLimit({ window: 1.5 }), RapidError);
    asserts.assertThrows(
      () => rateLimit({ headers: { limit: 'bad name' } }),
      RapidError,
      'headers.limit',
    );
  });

  it('over-budget HTTP requests get 429 + the full header set', async () => {
    const app = await Application.initialize({
      name: 'rlim',
      server: { port: 0 },
    });
    app.use(rateLimit({ max: 2, window: 60 }));
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
    const app = await Application.initialize({
      name: 'rlk',
      server: { port: 0 },
    });
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
    const app = await Application.initialize({
      name: 'rlj',
      server: { enabled: false },
    });
    app.use(rateLimit({ max: 1 }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    for (let i = 0; i < 4; i++) {
      asserts.assertEquals((await app.triggerJob('j')).status, 200);
    }
  });

  it('memoryRateLimitHooks: increment counts within the window and starts over once it passes (seconds)', async () => {
    const hooks = memoryRateLimitHooks();
    asserts.assertEquals((await hooks.increment('k', 0.05)).count, 1);
    asserts.assertEquals((await hooks.increment('k', 0.05)).count, 2);
    asserts.assertEquals((await hooks.increment('other', 0.05)).count, 1);
    await sleep(60);
    asserts.assertEquals((await hooks.increment('k', 0.05)).count, 1);
  });

  it('accepts injected async hooks (redis-shaped increment)', async () => {
    const counts = new Map<string, { count: number; resetAt: number }>();
    const hooks: RateLimitHooks = {
      increment: (k, window) => {
        const now = Date.now();
        const current = counts.get(k);
        const next = current === undefined || current.resetAt <= now
          ? { count: 1, resetAt: now + window * 1000 }
          : { count: current.count + 1, resetAt: current.resetAt };
        counts.set(k, next);
        return Promise.resolve(next);
      },
    };
    const app = await Application.initialize({
      name: 'rl-store',
      server: { port: 0 },
    });
    app.use(rateLimit({ max: 1, window: 10, hooks, key: () => 'k' }));
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
      asserts.assertEquals(counts.get('k')?.count, 2); // the injected hooks saw both
    } finally {
      await app.stop();
    }
  });
});

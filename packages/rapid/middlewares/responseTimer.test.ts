/**
 * @fileoverview responseTimer — the x-response-time header, the state
 * copy, and survival on the error path.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { responseTimer } from './responseTimer.ts';

describe('rapid.middlewares.responseTimer', () => {
  it('stamps x-response-time on HTTP responses', async () => {
    const app = await Application.initialize({
      name: 'rt',
      server: { port: 0 },
    });
    app.use(responseTimer());
    app.get('/t', () => ({ content: 'ok' }));
    await app.start();
    try {
      const r = await fetch(`http://localhost:${app.port}/t`);
      await r.text();
      asserts.assertMatch(r.headers.get('x-response-time') ?? '', /^\d+ms$/);
    } finally {
      await app.stop();
    }
  });

  it('a custom header name and the error path both work', async () => {
    const app = await Application.initialize({
      name: 'rte',
      server: { port: 0 },
    });
    app.use(responseTimer({ header: 'x-took' }));
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    await app.start();
    try {
      const r = await fetch(`http://localhost:${app.port}/boom`);
      await r.text();
      asserts.assertEquals(r.status, 500);
      // A failed invocation still reports how long it took to fail.
      asserts.assertMatch(r.headers.get('x-took') ?? '', /^\d+ms$/);
    } finally {
      await app.stop();
    }
  });

  it('stateKey exposes milliseconds to OUTER middleware on any transport', async () => {
    const app = await Application.initialize({
      name: 'rtj',
      server: { enabled: false },
    });
    let seen: unknown = 'never-set';
    // Probe OUTSIDE the timer: it reads state after the timer's finally.
    app.use(async (ctx, next) => {
      await next();
      seen = (ctx.state as Record<string, unknown>)['tookMs'];
    });
    app.use(responseTimer({ stateKey: 'tookMs' }));
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    await app.triggerJob('j');
    asserts.assert(typeof seen === 'number' && seen >= 0);
  });
});

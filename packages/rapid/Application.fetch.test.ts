/**
 * @fileoverview `Application.fetch()` — serving without a listener. The
 * same routes/middleware/disclosure as `start()`, driven one Request at a
 * time (Workers, Deno.serve/Bun.serve, in-process tests).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from './Application.ts';
import { RapidError } from './errors/mod.ts';
import { responseTimer } from './middlewares/mod.ts';

const make = (name: string, extra: Record<string, unknown> = {}) =>
  new Application({
    name,
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-fetch-test' },
    ...extra,
  });

describe('rapid.Application.fetch', () => {
  it('serves routes, middleware and 404s from a Request — no port, no start()', async () => {
    const app = make('fetch-basic');
    app.use((ctx, next) => {
      if (ctx.type === 'HTTP') ctx.setHeader('x-mw', 'ran');
      return next();
    });
    app.get(
      '/hello/:name:',
      (ctx) => ({ content: { hi: ctx.args.params.name } }),
    );

    const ok = await app.fetch(new Request('http://app/hello/ada'));
    asserts.assertEquals(ok.status, 200);
    asserts.assertEquals(await ok.json(), { hi: 'ada' });
    asserts.assertEquals(ok.headers.get('x-mw'), 'ran');
    asserts.assert(ok.headers.get('x-request-id')); // correlation echo, framework-owned

    const miss = await app.fetch(new Request('http://app/nope'));
    asserts.assertEquals(miss.status, 404);
    asserts.assertEquals((await miss.json()).code, 'RAPID_NOT_FOUND');

    asserts.assertEquals(app.address, null);
    asserts.assertEquals(app.port, null);
    asserts.assertEquals(app.metrics, undefined);
    await app.stop(); // fetch-only use: nothing to tear down, must not throw
  });

  it('a sync handler yields a Response synchronously (no promise on the hot path)', async () => {
    const app = make('fetch-sync');
    app.get('/s', () => ({ content: 'sync' }));
    const r = app.fetch(new Request('http://app/s'));
    asserts.assert(r instanceof Response);
    asserts.assertEquals(await r.text(), 'sync');
    await app.stop();
  });

  it('info.remoteAddress reaches ctx.remoteAddress (public IPs only, per resolveClientAddress); absent → empty', async () => {
    const app = make('fetch-addr');
    app.get('/ip', (ctx) => ({
      content: { address: ctx.remoteAddress, chain: [...ctx.remoteAddrList] },
    }));
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/ip'), {
        remoteAddress: '8.8.8.8',
      })).json(),
      { address: '8.8.8.8', chain: ['8.8.8.8'] },
    );
    // A non-public peer resolves to '' but still appears in the observed chain.
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/ip'), {
        remoteAddress: '10.0.0.5',
      })).json(),
      { address: '', chain: ['10.0.0.5'] },
    );
    asserts.assertEquals(
      await (await app.fetch(new Request('http://app/ip'))).json(),
      {
        address: '',
        chain: [],
      },
    );
    await app.stop();
  });

  it('registered socket commands make fetch() refuse with RAPID_CONFIG — HTTP only', () => {
    const app = make('fetch-socket');
    app.socket('ping', () => {});
    const err = asserts.assertThrows(
      () => app.fetch(new Request('http://app/')),
      RapidError,
    );
    asserts.assertEquals(err.code, 'RAPID_CONFIG');
    asserts.assertStringIncludes(err.message, 'socket commands');
  });

  it("shares start()'s boot invariants: SHARE state + a stateKey middleware is refused", () => {
    const app = make('fetch-share', { stateMode: 'SHARE' });
    app.use(responseTimer({ stateKey: 'duration' }));
    const err = asserts.assertThrows(
      () => app.fetch(new Request('http://app/')),
      RapidError,
    );
    asserts.assertEquals(err.code, 'RAPID_CONFIG');
    asserts.assertStringIncludes(err.message, "stateMode: 'SHARE'");
  });

  it('fetch() then start(): the prepared routes are reused on the listener, not re-registered', async () => {
    const app = make('fetch-then-start');
    app.get('/x', () => ({ content: { ok: true } }));
    asserts.assertEquals(
      (await app.fetch(new Request('http://app/x'))).status,
      200,
    );
    await app.start(); // a second registration of /x would be a radrouter collision → RAPID_CONFIG
    try {
      const live = await fetch(`http://127.0.0.1:${app.port}/x`);
      asserts.assertEquals(await live.json(), { ok: true });
      asserts.assertEquals(
        (await app.fetch(new Request('http://app/x'))).status,
        200,
      ); // still works alongside
    } finally {
      await app.stop();
    }
  });

  it('jobs are not scheduled by fetch(); triggerJob still runs the onion', async () => {
    const app = make('fetch-jobs');
    let ran = 0;
    app.job('tick', '0 6 * * *', () => {
      ran++;
      return { content: 'ran' };
    });
    app.get('/', () => ({ content: 'hi' }));
    await app.fetch(new Request('http://app/'));
    asserts.assertEquals(app.jobMetrics, undefined); // no scheduler started
    const outcome = await app.triggerJob('tick');
    asserts.assertEquals([outcome.status, outcome.handlerRan, ran], [
      200,
      true,
      1,
    ]);
    await app.stop();
  });
});

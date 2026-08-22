/**
 * @fileoverview requestId — extra header stamping, the state copy, and
 * the socket envelope echo.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { SOCKETContext } from '../context/mod.ts';
import type { RapidContext } from '../types/mod.ts';
import { requestId } from './requestId.ts';

describe('rapid.middlewares.requestId', () => {
  it('stamps additional HTTP headers with the core-minted id', async () => {
    const app = await Application.initialize({
      name: 'rid',
      server: { port: 0 },
    });
    app.use(requestId({ headers: ['x-correlation-id'] }));
    app.get('/r', () => ({ content: 'ok' }));
    await app.start();
    try {
      const r = await fetch(`http://localhost:${app.port}/r`);
      await r.text();
      const core = r.headers.get('x-request-id');
      asserts.assert(core !== null && core.length > 0);
      // Same id, extra name — the middleware never re-mints.
      asserts.assertEquals(r.headers.get('x-correlation-id'), core);
    } finally {
      await app.stop();
    }
  });

  it('copies the id into ctx.state for downstream code', async () => {
    const app = await Application.initialize({
      name: 'rids',
      server: { enabled: false },
    });
    let seen: unknown;
    app.use(requestId({ stateKey: 'rid' }));
    app.use(async (ctx, next) => {
      seen = (ctx.state as Record<string, unknown>)['rid'];
      await next();
    });
    app.job('j', '0 6 * * *', () => ({ content: 'ran' }));
    await app.triggerJob('j');
    asserts.assert(typeof seen === 'string' && seen.length > 0);
  });

  it('socketEcho adds requestId to object envelopes, never clobbers', async () => {
    const app = await Application.initialize({
      name: 'ride',
      server: { enabled: false },
    });
    const make = () =>
      new SOCKETContext(app, {
        connection: { id: 'c1', query: {}, headers: new Headers() },
        command: 'echo',
        payload: {},
      });
    const mw = requestId({ socketEcho: true });

    const ctx = make();
    await mw(ctx as unknown as RapidContext, async () => {
      ctx.response = { status: 200, content: { a: 1 } };
    });
    const content = ctx.response?.content as Record<string, unknown>;
    asserts.assertEquals(content['a'], 1);
    asserts.assertEquals(content['requestId'], ctx.requestId);
    asserts.assertEquals(ctx.response?.status, 200); // status preserved

    // An existing requestId key wins; string content is left alone.
    const ctx2 = make();
    await mw(ctx2 as unknown as RapidContext, async () => {
      ctx2.response = { content: { requestId: 'caller-owned' } };
    });
    asserts.assertEquals(
      (ctx2.response?.content as Record<string, unknown>)['requestId'],
      'caller-owned',
    );
    const ctx3 = make();
    await mw(ctx3 as unknown as RapidContext, async () => {
      ctx3.response = { content: 'plain text' };
    });
    asserts.assertEquals(ctx3.response?.content, 'plain text');
  });

  it('R2-M4: an ARRAY reply is left alone, never spread into an object', async () => {
    // `[1,2,3]` is typeof 'object', is not a Uint8Array, and has no
    // 'requestId' key — so it passed every guard and became
    // {"0":1,"1":2,"2":3,requestId}, destroying the reply's shape.
    const app = await Application.initialize({
      name: 'rida',
      server: { enabled: false },
    });
    const ctx = new SOCKETContext(app, {
      connection: { id: 'c1', query: {}, headers: new Headers() },
      command: 'list',
      payload: {},
    });
    await requestId({ socketEcho: true })(
      ctx as unknown as RapidContext,
      async () => {
        ctx.response = {
          content: [1, 2, 3] as unknown as Record<string, unknown>,
        };
      },
    );
    asserts.assertEquals(
      ctx.response?.content as unknown as number[],
      [1, 2, 3],
    );
  });
});

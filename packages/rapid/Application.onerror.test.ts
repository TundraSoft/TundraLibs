/**
 * @fileoverview `app.onError` — the per-request error hook may override the
 * disclosure envelope; a throwing hook falls back to the default; no hook
 * keeps the default. Fires for every disclosed error.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';
import { RapidError } from './errors/mod.ts';

describe('rapid.Application onError', () => {
  it('overrides the disclosure envelope (status + body)', async () => {
    const app = new Application({
      name: 'oe',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.onError((err, ctx) => ({
      status: 418,
      content: { teapot: true, code: err.code, id: ctx.requestId },
    }));
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    const res = await app.fetch(new Request('http://app/boom'));
    asserts.assertEquals(res.status, 418);
    const body = await res.json();
    asserts.assertEquals(body.teapot, true);
    asserts.assertEquals(body.code, 'RAPID_UNHANDLED');
    asserts.assert(typeof body.id === 'string' && body.id.length > 0);
  });

  it('fires for a framework 404 too (every disclosed error)', async () => {
    const app = new Application({
      name: 'oe-404',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.onError((err) =>
      err.code === 'RAPID_NOT_FOUND'
        ? { status: 404, content: { oops: 'nowhere' } }
        : undefined
    );
    const res = await app.fetch(new Request('http://app/missing'));
    asserts.assertEquals(res.status, 404);
    asserts.assertEquals((await res.json()).oops, 'nowhere');
  });

  it('returning nothing keeps the DEFAULT envelope', async () => {
    const app = new Application({
      name: 'oe-passthrough',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.onError(() => undefined);
    app.get('/boom', () => {
      throw new RapidError('RAPID_ACCESS_DENIED');
    });
    const res = await app.fetch(new Request('http://app/boom'));
    asserts.assertEquals(res.status, 403);
    asserts.assertEquals((await res.json()).code, 'RAPID_ACCESS_DENIED');
  });

  it('a THROWING hook never breaks disclosure — falls back to default', async () => {
    const app = new Application({
      name: 'oe-throws',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] }, // silence the logged hook error
    });
    app.onError(() => {
      throw new Error('hook is buggy');
    });
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    const res = await app.fetch(new Request('http://app/boom'));
    asserts.assertEquals(res.status, 500);
    asserts.assertEquals((await res.json()).code, 'RAPID_UNHANDLED');
  });
});

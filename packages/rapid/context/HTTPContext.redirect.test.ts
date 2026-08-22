/**
 * @fileoverview The reply `redirect` key: a string → 302, `{ permanent }` →
 * 301, `location` set and an empty body, precedence over `status`; works from a
 * plain handler and a module method; and — the transport rule — it is
 * SILENTLY IGNORED on a JOB (never a 3xx there, which jobs reject).
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { GET, Module } from '../decorators/mod.ts';
import type { RapidContextResponse } from '../types/mod.ts';

const make = () =>
  Application.initialize({
    name: 'redirect',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });
// app.fetch follows nothing — the raw 3xx comes back to us.
const get = (app: Application, path: string) =>
  app.fetch(new Request(`http://app${path}`, { redirect: 'manual' }));

describe('reply `redirect` key', () => {
  it('a string → 302 + location, empty body; { permanent } → 301', async () => {
    const app = await make();
    app.get('/a', () => ({ content: '', redirect: '/login' }));
    app.get('/b', () => ({
      content: '',
      redirect: { url: '/new', permanent: true },
    }));
    const a = await get(app, '/a');
    asserts.assertEquals(a.status, 302);
    asserts.assertEquals(a.headers.get('location'), '/login');
    asserts.assertEquals(await a.text(), '');
    const b = await get(app, '/b');
    asserts.assertEquals(b.status, 301);
    asserts.assertEquals(b.headers.get('location'), '/new');
  });

  it('takes precedence over an explicit status', async () => {
    const app = await make();
    app.get('/r', () => ({ content: '', status: 200, redirect: '/x' }));
    const r = await get(app, '/r');
    asserts.assertEquals(r.status, 302);
  });

  it('works from a module method (transport-blind — no ctx needed)', async () => {
    @Module('Mover', {})
    class Mover {
      @GET('/old')
      go(): RapidContextResponse {
        return { content: '', redirect: '/new' };
      }
    }
    const app = await make();
    app.module(new Mover());
    const r = await get(app, '/old');
    asserts.assertEquals(r.status, 302);
    asserts.assertEquals(r.headers.get('location'), '/new');
  });

  it('is silently ignored on a JOB — never a 3xx there', async () => {
    const app = await make();
    app.job(
      'j',
      '* * * * *',
      () => ({ content: { ok: true }, redirect: '/x' }),
    );
    const out = await app.triggerJob('j');
    asserts.assertEquals(out.status, 200); // not 302, not a 3xx rejection
  });
});

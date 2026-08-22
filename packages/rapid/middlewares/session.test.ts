/**
 * @fileoverview `session()` — persistence across requests via the signed
 * cookie, no cookie for read-only requests, regenerate (rotate id + keep data
 * + evict old), destroy (clear), and rejection of a tampered id.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { getSession, session } from './session.ts';

const makeApp = async () => {
  const app = await Application.initialize({
    name: 'sess',
    secret: 'test-secret-0123456789-abcdefghijklmnop',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });
  app.use(session({ secure: false })); // http test → Secure off
  app.get(
    '/read',
    (ctx) => ({ content: { hits: getSession(ctx)!.get<number>('hits') ?? 0 } }),
  );
  app.post('/hit', (ctx) => {
    const s = getSession(ctx)!;
    s.set('hits', (s.get<number>('hits') ?? 0) + 1);
    return { content: { hits: s.get<number>('hits') } };
  });
  app.post('/login', (ctx) => {
    const s = getSession(ctx)!;
    s.regenerate();
    s.set('userId', 'u1');
    return { content: { ok: true } };
  });
  app.post('/logout', (ctx) => {
    getSession(ctx)!.destroy();
    return { content: { ok: true } };
  });
  return app;
};

const sidFrom = (res: Response): string | undefined =>
  res.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1];

describe('rapid session()', () => {
  it('persists data across requests via the signed cookie', async () => {
    const app = await makeApp();
    const r1 = await app.fetch(
      new Request('http://app/hit', { method: 'POST' }),
    );
    asserts.assertEquals((await r1.json()).hits, 1);
    const sid = sidFrom(r1);
    asserts.assert(sid, 'first write should issue a sid cookie');
    const r2 = await app.fetch(
      new Request('http://app/hit', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    asserts.assertEquals((await r2.json()).hits, 2);
  });

  it('does not set a cookie for a read-only request with no session', async () => {
    const app = await makeApp();
    const r = await app.fetch(new Request('http://app/read'));
    asserts.assertEquals((await r.json()).hits, 0);
    asserts.assertEquals(r.headers.get('set-cookie'), null);
  });

  it('regenerate() rotates the id, keeps the data, evicts the old id', async () => {
    const app = await makeApp();
    const sid1 = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    const sid2 = sidFrom(
      await app.fetch(
        new Request('http://app/login', {
          method: 'POST',
          headers: { cookie: `sid=${sid1}` },
        }),
      ),
    )!;
    asserts.assert(sid2 && sid2 !== sid1, 'login should rotate the sid');
    // Rotated session still carries the pre-login hit count.
    const r3 = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid2}` } }),
    );
    asserts.assertEquals((await r3.json()).hits, 1);
    // The old id was evicted → fresh session.
    const r4 = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid1}` } }),
    );
    asserts.assertEquals((await r4.json()).hits, 0);
  });

  it('destroy() clears the session', async () => {
    const app = await makeApp();
    const sid = sidFrom(
      await app.fetch(new Request('http://app/hit', { method: 'POST' })),
    )!;
    const r2 = await app.fetch(
      new Request('http://app/logout', {
        method: 'POST',
        headers: { cookie: `sid=${sid}` },
      }),
    );
    asserts.assertStringIncludes(r2.headers.get('set-cookie') ?? '', 'sid=');
    const r3 = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `sid=${sid}` } }),
    );
    asserts.assertEquals((await r3.json()).hits, 0);
  });

  it('rejects a tampered id (bad signature) as no session', async () => {
    const app = await makeApp();
    const r = await app.fetch(
      new Request('http://app/read', {
        headers: { cookie: 'sid=forged.bad' }, // malformed sig must not 500
      }),
    );
    asserts.assertEquals((await r.json()).hits, 0);
  });
});

/**
 * @fileoverview `csrf()` — issues a signed token cookie on safe requests, and
 * on state-changing methods requires the echoed token to match the cookie and
 * carry a valid signature (else 403).
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { csrf } from './csrf.ts';

const makeApp = async () => {
  const app = await Application.initialize({
    name: 'csrf',
    secret: 'test-secret-0123456789-abcdefghijklmnop',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });
  app.use(csrf({ secure: false }));
  app.get('/form', () => ({ content: { ok: true } }));
  app.post('/submit', () => ({ content: { ok: true } }));
  return app;
};

const tokenFrom = (res: Response): string | undefined =>
  res.headers.get('set-cookie')?.match(/csrf=([^;]+)/)?.[1];

describe('rapid csrf()', () => {
  it('is callable with no arguments (the documented app.use(csrf()) form)', () => {
    asserts.assertEquals(typeof csrf(), 'function');
  });

  it('issues a signed token cookie on a safe request', async () => {
    const app = await makeApp();
    const r = await app.fetch(new Request('http://app/form'));
    asserts.assert(tokenFrom(r), 'a GET should issue a csrf cookie');
  });

  it('rejects a state-changing request with no token (403)', async () => {
    const app = await makeApp();
    const r = await app.fetch(
      new Request('http://app/submit', { method: 'POST' }),
    );
    asserts.assertEquals(r.status, 403);
    asserts.assertEquals((await r.json()).code, 'RAPID_CSRF_INVALID');
  });

  it('accepts a POST mirroring the cookie token into the header', async () => {
    const app = await makeApp();
    const token = tokenFrom(await app.fetch(new Request('http://app/form')))!;
    const r = await app.fetch(
      new Request('http://app/submit', {
        method: 'POST',
        headers: { cookie: `csrf=${token}`, 'x-csrf-token': token },
      }),
    );
    asserts.assertEquals(r.status, 200);
    asserts.assertEquals((await r.json()).ok, true);
  });

  it('a token minted anonymously is rejected once a session cookie exists — a planted token never rides a victim session', async () => {
    const app = await makeApp();
    const planted = tokenFrom(await app.fetch(new Request('http://app/form')))!;
    const r = await app.fetch(
      new Request('http://app/submit', {
        method: 'POST',
        headers: {
          cookie: `csrf=${planted}; sid=victim-session`,
          'x-csrf-token': planted,
        },
      }),
    );
    asserts.assertEquals(r.status, 403);
    asserts.assertEquals((await r.json()).code, 'RAPID_CSRF_INVALID');
  });

  it('a token is bound to the session it was issued under — verifies there, nowhere else', async () => {
    const app = await makeApp();
    const bound = tokenFrom(
      await app.fetch(
        new Request('http://app/form', { headers: { cookie: 'sid=abc' } }),
      ),
    )!;
    const own = await app.fetch(
      new Request('http://app/submit', {
        method: 'POST',
        headers: { cookie: `csrf=${bound}; sid=abc`, 'x-csrf-token': bound },
      }),
    );
    asserts.assertEquals(own.status, 200);
    await own.body?.cancel();
    const other = await app.fetch(
      new Request('http://app/submit', {
        method: 'POST',
        headers: { cookie: `csrf=${bound}; sid=xyz`, 'x-csrf-token': bound },
      }),
    );
    asserts.assertEquals(other.status, 403); // tossed onto another session
  });

  it('a session change re-issues the token on the next response; an unchanged one is kept', async () => {
    const app = await makeApp();
    const bound = tokenFrom(
      await app.fetch(
        new Request('http://app/form', { headers: { cookie: 'sid=abc' } }),
      ),
    )!;
    const same = await app.fetch(
      new Request('http://app/form', {
        headers: { cookie: `csrf=${bound}; sid=abc` },
      }),
    );
    asserts.assertEquals(tokenFrom(same), undefined); // still bound → no re-issue
    const rotated = await app.fetch(
      new Request('http://app/form', {
        headers: { cookie: `csrf=${bound}; sid=after-login` },
      }),
    );
    const fresh = tokenFrom(rotated);
    asserts.assert(
      fresh !== undefined && fresh !== bound,
      'a new token follows the session',
    );
  });

  it('rejects a forged/unsigned token (403)', async () => {
    const app = await makeApp();
    const r = await app.fetch(
      new Request('http://app/submit', {
        method: 'POST',
        headers: { cookie: 'csrf=forged.bad', 'x-csrf-token': 'forged.bad' },
      }),
    );
    asserts.assertEquals(r.status, 403);
  });
});

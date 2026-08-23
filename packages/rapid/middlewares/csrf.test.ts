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

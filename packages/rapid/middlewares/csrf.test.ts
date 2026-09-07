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
import { getSession, session } from './session.ts';
import { html, template } from '../ui/html.ts';

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

describe('rapid csrf() with session() — token follows the session on the SAME response', () => {
  const setCookies = (res: Response) => res.headers.getSetCookie();
  const valueOf = (cookies: string[], name: string) =>
    cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0]!.slice(
      name.length + 1,
    );

  const pairedApp = async () => {
    const app = await Application.initialize({
      name: 'csrf-sess',
      secret: 'test-secret-0123456789-abcdefghijklmnop',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(csrf({ secure: false }), session({ secure: false })); // csrf OUTER
    app.get('/form', () => ({ content: { ok: true } }));
    app.post('/add', async (ctx) => {
      const s = (await getSession(ctx))!;
      s.set('n', (s.get<number>('n') ?? 0) + 1);
      return { content: { n: s.get<number>('n') } };
    });
    app.post('/login', async (ctx) => {
      (await getSession(ctx))!.regenerate();
      return { content: { ok: true } };
    });
    return app;
  };

  it('the response that MINTS the session re-issues a token bound to it — the next POST succeeds without an intervening GET', async () => {
    const app = await pairedApp();
    const t0 = tokenFrom(await app.fetch(new Request('http://app/form')))!;
    const add1 = await app.fetch(
      new Request('http://app/add', {
        method: 'POST',
        headers: { cookie: `csrf=${t0}`, 'x-csrf-token': t0 },
      }),
    );
    asserts.assertEquals(add1.status, 200);
    const jar = setCookies(add1);
    const sid = valueOf(jar, 'sid');
    const t1 = valueOf(jar, 'csrf');
    asserts.assert(sid, 'the session was minted on this response');
    asserts.assert(t1 && t1 !== t0, 'a NEW token rides the same response');
    await add1.body?.cancel();
    const add2 = await app.fetch(
      new Request('http://app/add', {
        method: 'POST',
        headers: { cookie: `sid=${sid}; csrf=${t1}`, 'x-csrf-token': t1 },
      }),
    );
    asserts.assertEquals(add2.status, 200);
    asserts.assertEquals(await add2.json(), { n: 2 });
    await app.stop();
  });

  it('a rotation (regenerate) re-binds the token on the rotating response too', async () => {
    const app = await pairedApp();
    const t0 = tokenFrom(await app.fetch(new Request('http://app/form')))!;
    const first = await app.fetch(
      new Request('http://app/add', {
        method: 'POST',
        headers: { cookie: `csrf=${t0}`, 'x-csrf-token': t0 },
      }),
    );
    const sid0 = valueOf(setCookies(first), 'sid')!;
    const t1 = valueOf(setCookies(first), 'csrf')!;
    await first.body?.cancel();
    const login = await app.fetch(
      new Request('http://app/login', {
        method: 'POST',
        headers: { cookie: `sid=${sid0}; csrf=${t1}`, 'x-csrf-token': t1 },
      }),
    );
    asserts.assertEquals(login.status, 200);
    const sid1 = valueOf(setCookies(login), 'sid')!;
    const t2 = valueOf(setCookies(login), 'csrf')!;
    asserts.assert(sid1 !== sid0 && t2 !== t1);
    await login.body?.cancel();
    const after = await app.fetch(
      new Request('http://app/add', {
        method: 'POST',
        headers: { cookie: `sid=${sid1}; csrf=${t2}`, 'x-csrf-token': t2 },
      }),
    );
    asserts.assertEquals(after.status, 200);
    await after.body?.cancel();
    await app.stop();
  });

  it('view.csrfToken is the token issued on THIS response — a first-visit form is not empty', async () => {
    const app = await Application.initialize({
      name: 'csrf-view',
      secret: 'test-secret-0123456789-abcdefghijklmnop',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(csrf({ secure: false }));
    const Form = template<unknown>(
      (_d, view) => html`<i>${view.csrfToken ?? ''}</i>`,
      'Form',
    );
    app.get('/page', { template: { render: Form, prefer: 'html' } }, () => ({
      content: {},
    }));
    const res = await app.fetch(new Request('http://app/page'));
    const issued = tokenFrom(res)!;
    asserts.assert(issued);
    asserts.assertEquals(await res.text(), `<i>${issued}</i>`);
    await app.stop();
  });
});

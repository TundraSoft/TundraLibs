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
import { RapidError } from '../errors/mod.ts';
import { getSession, session } from './session.ts';
import { html, template } from '../ui/html.ts';
import { unmaskToken } from '../utils/csrfMask.ts';

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
  it('rejects a malformed configuration at build — names, path, SameSite=None, cookie prefixes', () => {
    const cases: [Parameters<typeof csrf>[0], string][] = [
      [{ cookie: 'csrf token' }, 'not a valid cookie name'],
      [{ session: 'sid;' }, 'not a valid cookie name'],
      [{ header: 'x csrf' }, 'not a valid header name'],
      [{ field: '' }, 'field'],
      [{ path: 'app' }, 'path must start with /'],
      [{ sameSite: 'None', secure: false }, 'SameSite=None must be Secure'],
      [{ cookie: '__Host-csrf', path: '/app' }, '__Host- prefix'],
      [{ cookie: '__Host-csrf', secure: false }, '__Host- prefix'],
      [{ cookie: '__Secure-csrf', secure: false }, '__Secure- prefix'],
    ];
    for (const [options, message] of cases) {
      asserts.assertThrows(() => csrf(options), RapidError, message);
    }
    csrf({ cookie: '__Host-csrf' });
    csrf({ sameSite: 'None' });
    csrf({
      cookie: 'x-csrf',
      header: 'X-CSRF',
      field: 'csrf_token',
      path: '/app',
    });
  });

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
    const rendered = (await res.text()).slice(3, -4);
    // MASKED per response: never the cookie's bytes, always the cookie's token.
    asserts.assertNotEquals(rendered, issued);
    asserts.assert(!rendered.includes(issued.slice(0, 12)));
    asserts.assertEquals(unmaskToken(rendered), issued);
    await app.stop();
  });
});

describe('rapid csrf() — cookie attributes', () => {
  it('the token cookie is readable by page scripts (never HttpOnly) and SameSite=Lax', async () => {
    const app = await makeApp();
    try {
      const r = await app.fetch(new Request('http://app/form'));
      const cookie = r.headers.get('set-cookie') ?? '';
      await r.body?.cancel();
      asserts.assertMatch(cookie, /^csrf=[^;]+; /);
      asserts.assert(!/HttpOnly/i.test(cookie), 'the runtime must read it');
      asserts.assertMatch(cookie, /; SameSite=Lax/);
      asserts.assertMatch(cookie, /; Path=\//);
    } finally {
      await app.stop();
    }
  });
});

describe('rapid csrf() — masked tokens (BREACH)', () => {
  it('two renders mask differently, both echo back valid in the header and in the form field; a tampered mask is 403; the bare cookie still works', async () => {
    const app = await Application.initialize({
      name: 'csrf-mask',
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
    app.post('/submit', () => ({ content: { ok: true } }));
    try {
      const first = await app.fetch(new Request('http://app/page'));
      const cookie = tokenFrom(first)!;
      const maskA = (await first.text()).slice(3, -4);
      const second = await app.fetch(
        new Request('http://app/page', {
          headers: { cookie: `csrf=${cookie}` },
        }),
      );
      const maskB = (await second.text()).slice(3, -4);
      asserts.assertNotEquals(maskA, maskB);
      asserts.assertNotEquals(maskA, cookie);

      const post = (headers: Record<string, string>, body?: BodyInit) =>
        app.fetch(
          new Request('http://app/submit', {
            method: 'POST',
            headers: { cookie: `csrf=${cookie}`, ...headers },
            body,
          }),
        );
      const viaHeader = await post({ 'x-csrf-token': maskA });
      asserts.assertEquals(viaHeader.status, 200);
      await viaHeader.body?.cancel();
      const viaField = await post(
        { 'content-type': 'application/x-www-form-urlencoded' },
        new URLSearchParams({ _csrf: maskB }).toString(),
      );
      asserts.assertEquals(viaField.status, 200);
      await viaField.body?.cancel();
      const bare = await post({ 'x-csrf-token': cookie });
      asserts.assertEquals(bare.status, 200);
      await bare.body?.cancel();

      const at = maskA.indexOf('~') + 1;
      const tampered = maskA.slice(0, at) +
        (maskA[at] === '0' ? '1' : '0') + maskA.slice(at + 1);
      const rejected = await post({ 'x-csrf-token': tampered });
      asserts.assertEquals(rejected.status, 403);
      await rejected.body?.cancel();
      const malformed = await post({ 'x-csrf-token': 'zz~zz' });
      asserts.assertEquals(malformed.status, 403);
      await malformed.body?.cancel();
    } finally {
      await app.stop();
    }
  });
});

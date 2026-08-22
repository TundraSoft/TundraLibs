/**
 * @fileoverview Signed cookies + the reply `cookies` key, all keyed off the ONE
 * app `secret`: a signed cookie round-trips through ctx.signedCookie, a
 * tampered value verifies to undefined, the reply key sets plain and signed
 * cookies (HTTP) and is ignored on a JOB, and a weak/missing secret fails
 * loudly at the right moment.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';

const SECRET = 'test-secret-0123456789-abcdefghijklmnop'; // ≥ 32 chars
const make = (secret?: string) =>
  Application.initialize({
    name: 'cookies',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    ...(secret === undefined ? {} : { secret }),
  });
const cookieValue = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(
    ';',
  )[0].slice(name.length + 1);

describe('signed cookies + reply cookies', () => {
  it('a signed cookie is tamper-evident: round-trips, a forgery reads as undefined', async () => {
    const app = await make(SECRET);
    app.get('/set', async (ctx) => {
      await ctx.setCookie('prefs', 'dark', { signed: true });
      return { content: { ok: true } };
    });
    app.get('/read', async (ctx) => ({
      content: { prefs: (await ctx.signedCookie('prefs')) ?? null },
    }));
    const set = await app.fetch(new Request('http://app/set'));
    const wire = cookieValue(set, 'prefs')!;
    asserts.assert(
      wire.startsWith('dark.'),
      `wire form value.sig, got ${wire}`,
    );
    // Genuine → verifies to the bare value.
    const ok = await app.fetch(
      new Request('http://app/read', { headers: { cookie: `prefs=${wire}` } }),
    );
    asserts.assertEquals((await ok.json()).prefs, 'dark');
    // Value altered, signature kept → rejected (never a 500).
    const forged = wire.replace('dark.', 'light.');
    const bad = await app.fetch(
      new Request('http://app/read', {
        headers: { cookie: `prefs=${forged}` },
      }),
    );
    asserts.assertEquals(bad.status, 200);
    asserts.assertEquals((await bad.json()).prefs, null);
  });

  it('the reply `cookies` key sets plain and signed cookies with proper encoding', async () => {
    const app = await make(SECRET);
    app.get('/r', () => ({
      content: { ok: true },
      cookies: [
        { name: 'theme', value: 'a b', options: { path: '/' } },
        {
          name: 'sid',
          value: 'abc',
          options: { signed: true, httpOnly: true },
        },
      ],
    }));
    const res = await app.fetch(new Request('http://app/r'));
    asserts.assertEquals(cookieValue(res, 'theme'), 'a%20b'); // encoded
    const sid = cookieValue(res, 'sid')!;
    asserts.assert(sid.startsWith('abc.'), 'signed wire form');
    asserts.assert(
      res.headers.getSetCookie().some((c) =>
        c.startsWith('sid=') && /HttpOnly/i.test(c)
      ),
    );
  });

  it('the reply `cookies` key is ignored on a JOB (HTTP-only, harmless on a shared method)', async () => {
    const app = await make(SECRET);
    app.job('j', '* * * * *', () => ({
      content: { ok: true },
      cookies: [{ name: 'x', value: 'y' }],
    }));
    const out = await app.triggerJob('j');
    asserts.assertEquals(out.status, 200);
  });

  it('a weak secret is refused at boot (RAPID_CONFIG)', async () => {
    await asserts.assertRejects(() => make('too-short'), RapidError, 'secret');
  });

  it('signing without any secret fails where it bites (RAPID_CONFIG, not a silent plain cookie)', async () => {
    const app = await make(); // no secret
    app.get('/set', async (ctx) => {
      await ctx.setCookie('a', 'b', { signed: true });
      return { content: { ok: true } };
    });
    const res = await app.fetch(new Request('http://app/set'));
    asserts.assertEquals(res.status, 500);
    asserts.assertEquals((await res.json()).code, 'RAPID_CONFIG');
  });
});

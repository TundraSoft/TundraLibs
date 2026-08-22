/**
 * @fileoverview HTTPContext.serve() / .html() — file + HTML responses.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir, writeTextFile } from '@tundralibs/compat/file';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { HTTPContext } from './HTTPContext.ts';

const app = await Application.initialize({
  name: 'serve-test',
  server: { port: 0 },
});
const ctx = () =>
  new HTTPContext(app, {
    request: new Request('http://localhost/'),
    remoteAddress: '127.0.0.1',
  });

describe('rapid.HTTPContext.serve / .html', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'rapid-serve-' });
    await writeTextFile(`${dir}/page.html`, '<h1>Hi</h1>');
    await writeTextFile(`${dir}/data.json`, '{"a":1}');
  });
  afterAll(() => removeDir(dir, { recursive: true }));

  it('serve() STREAMS the file with an extension-derived content-type + length', async () => {
    const res = await ctx().serve(`${dir}/page.html`);
    asserts.assertEquals(res.status, 200);
    // The body is a stream (never buffered) — drain it to check the bytes.
    asserts.assert(res.content instanceof ReadableStream);
    asserts.assertEquals(
      await new Response(res.content as ReadableStream<Uint8Array>).text(),
      '<h1>Hi</h1>',
    );
    const headers = res.headers as Record<string, string>;
    asserts.assertEquals(headers['content-type'], 'text/html; charset=UTF-8');
    // Size comes from the stat so clients/HEAD see a real content-length.
    asserts.assertEquals(headers['content-length'], '11');
  });

  it('serve() honors contentType override + download attachment', async () => {
    const res = await ctx().serve(`${dir}/data.json`, {
      contentType: 'application/x-thing',
      download: 'report.json',
    });
    const h = res.headers as Record<string, string>;
    asserts.assertEquals(h['content-type'], 'application/x-thing');
    asserts.assertEquals(
      h['content-disposition'],
      'attachment; filename="report.json"',
    );
  });

  it('serve() on a missing path throws RAPID_NOT_FOUND (→ 404)', async () => {
    await asserts.assertRejects(
      () => ctx().serve(`${dir}/nope.html`),
      RapidError,
      'Not found',
    );
  });

  it('html() sets text/html and the given status', () => {
    const res = ctx().html('<p>hi</p>', 201);
    asserts.assertEquals(res.status, 201);
    asserts.assertEquals(res.content, '<p>hi</p>');
    asserts.assertEquals(
      (res.headers as Record<string, string>)['content-type'],
      'text/html; charset=UTF-8',
    );
  });

  it('redirect() → 302, permanent → 301, with a Location', () => {
    const r = ctx().redirect('/login');
    asserts.assertEquals(r.status, 302);
    asserts.assertEquals(
      (r.headers as Record<string, string>).location,
      '/login',
    );
    asserts.assertEquals(ctx().redirect('/new', true).status, 301);
  });

  it('cookies: parse inbound, set/delete outbound', () => {
    const c = new HTTPContext(app, {
      request: new Request('http://localhost/', {
        headers: { cookie: 'sid=abc; theme=dark' },
      }),
      remoteAddress: '127.0.0.1',
    });
    asserts.assertEquals(c.cookies, { sid: 'abc', theme: 'dark' });

    c.setCookie('token', 'xyz', { httpOnly: true, path: '/' });
    c.deleteCookie('sid', { path: '/' });
    const setCookies = c.responseHeaders.getSetCookie();
    asserts.assertEquals(setCookies[0], 'token=xyz; Path=/; HttpOnly');
    asserts.assert(setCookies[1]!.startsWith('sid=; Max-Age=0;'));
  });
});

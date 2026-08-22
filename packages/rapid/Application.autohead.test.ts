/**
 * @fileoverview `server.autoHead` — a HEAD is auto-registered for every GET
 * that lacks one, at boot; the response carries GET's headers + a correct
 * content-length with NO body. An explicit HEAD wins; off → 404.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';

const GET_BODY = { hello: 'world' };
const GET_LEN = String(
  new TextEncoder().encode(JSON.stringify(GET_BODY)).byteLength,
);

describe('rapid.Application autoHead', () => {
  it('default: HEAD to a GET route → 200, GET headers + content-length, empty body', async () => {
    const app = await Application.initialize({
      name: 'ah-on',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.get('/thing', () => ({ content: GET_BODY }));
    const res = await app.fetch(
      new Request('http://app/thing', { method: 'HEAD' }),
    );
    asserts.assertEquals(res.status, 200);
    asserts.assertStringIncludes(res.headers.get('content-type') ?? '', 'json');
    asserts.assertEquals(res.headers.get('content-length'), GET_LEN);
    asserts.assertEquals(await res.text(), ''); // no body
  });

  it('off: HEAD to a GET-only route is unmatched (404)', async () => {
    const app = await Application.initialize({
      name: 'ah-off',
      server: { port: 0, hostname: '127.0.0.1', autoHead: false },
    });
    app.get('/thing', () => ({ content: GET_BODY }));
    const res = await app.fetch(
      new Request('http://app/thing', { method: 'HEAD' }),
    );
    await res.body?.cancel();
    asserts.assertEquals(res.status, 404);
  });

  it('an explicit HEAD route wins over the synthesized one', async () => {
    const app = await Application.initialize({
      name: 'ah-explicit',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.get('/thing', () => ({ content: GET_BODY }));
    app.route('HEAD', '/thing', () => ({
      content: { ok: true },
      headers: { 'x-explicit': 'yes' },
    }));
    const res = await app.fetch(
      new Request('http://app/thing', { method: 'HEAD' }),
    );
    asserts.assertEquals(res.status, 200);
    asserts.assertEquals(res.headers.get('x-explicit'), 'yes');
    await res.body?.cancel();
  });

  it('a GET with no matching path still 404s on HEAD (no phantom routes)', async () => {
    const app = await Application.initialize({
      name: 'ah-none',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.get('/thing', () => ({ content: GET_BODY }));
    const res = await app.fetch(
      new Request('http://app/other', { method: 'HEAD' }),
    );
    await res.body?.cancel();
    asserts.assertEquals(res.status, 404);
  });
});

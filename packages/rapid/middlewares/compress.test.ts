/**
 * @fileoverview compress — gzip/deflate negotiation, threshold, and type
 * gating. (fetch transparently decodes the body, so we assert on the
 * Content-Encoding header and that the decoded payload is intact.)
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { compress } from './compress.ts';

describe('rapid.middlewares.compress', () => {
  let app: Application;
  let base = '';
  const big = 'x'.repeat(5000);
  beforeAll(async () => {
    app = new Application({
      name: 'compress',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.use(compress());
    app.get('/big', () => ({ content: { data: big } }));
    app.get('/small', () => ({ content: { ok: true } }));
    app.get('/bin', () => ({
      content: new Uint8Array(4000),
      headers: { 'content-type': 'image/png' },
    }));
    await app.start();
    base = `http://127.0.0.1:${app.port}`;
  });
  afterAll(async () => {
    await app.stop();
  });

  it('gzips a large compressible body and sets Vary', async () => {
    const r = await fetch(`${base}/big`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    asserts.assertEquals(r.headers.get('content-encoding'), 'gzip');
    asserts.assertEquals(r.headers.get('vary'), 'Accept-Encoding');
    asserts.assertEquals(r.headers.get('content-type'), 'application/json');
    // Decoded (by fetch) payload is intact.
    asserts.assertEquals((await r.json()).data, big);
  });

  it('skips a body under the threshold', async () => {
    const r = await fetch(`${base}/small`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    await r.text();
    asserts.assertEquals(r.headers.get('content-encoding'), null);
  });

  it('skips an already-compressed content-type (image/png)', async () => {
    const r = await fetch(`${base}/bin`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    await r.arrayBuffer();
    asserts.assertEquals(r.headers.get('content-encoding'), null);
  });

  it('does nothing without an acceptable encoding', async () => {
    const r = await fetch(`${base}/big`, {
      headers: { 'accept-encoding': 'br' }, // brotli — unsupported here
    });
    await r.json();
    asserts.assertEquals(r.headers.get('content-encoding'), null);
  });
});

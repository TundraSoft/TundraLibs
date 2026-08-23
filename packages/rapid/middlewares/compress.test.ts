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
import { cors } from './cors.ts';
import { middlewareScope } from './scope.ts';

describe('rapid.middlewares.compress', () => {
  let app: Application;
  let base = '';
  const big = 'x'.repeat(5000);
  beforeAll(async () => {
    app = await Application.initialize({
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
    app.get('/str', () => ({
      content: big,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }));
    app.route('HEAD', '/headbig', () => ({ content: { data: big } }));
    // Large body on a 204 → only the NO_BODY status guard (not the size
    // guard) can be what skips it.
    app.get('/nc', () => ({
      status: 204,
      content: big,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
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

  it('buffered path: a handler-set content-length does not survive onto the smaller gzip body', async () => {
    // In-process fetch so the raw wire headers are observable (a real fetch
    // would decode gzip and repair the length, hiding the bug).
    const a = await Application.initialize({
      name: 'cz',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    a.use(compress());
    a.get('/x', () => ({
      content: big,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': '999999', // the UNCOMPRESSED length the handler knew
      },
    }));
    const res = await a.fetch(
      new Request('http://app/x', { headers: { 'accept-encoding': 'gzip' } }),
    );
    asserts.assertEquals(res.headers.get('content-encoding'), 'gzip');
    const actual = (await res.arrayBuffer()).byteLength;
    // Reported length equals the ACTUAL compressed body — never the stale value.
    asserts.assertEquals(res.headers.get('content-length'), String(actual));
    asserts.assert(res.headers.get('content-length') !== '999999');
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

  it('deflate: accept-encoding deflate → content-encoding deflate', async () => {
    const r = await fetch(`${base}/big`, {
      headers: { 'accept-encoding': 'deflate' },
    });
    // `content-encoding: deflate` is set ONLY when pickEncoding chose
    // deflate and compressBytes ran — that alone covers the branch. Body
    // size can't be asserted portably: some runtimes' fetch transparently
    // inflates `deflate` (and keeps the header), others don't.
    asserts.assertEquals(r.headers.get('content-encoding'), 'deflate');
    await r.arrayBuffer();
  });

  it('compresses a large text/plain STRING body', async () => {
    const r = await fetch(`${base}/str`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    asserts.assertEquals(r.headers.get('content-encoding'), 'gzip');
    asserts.assertEquals(await r.text(), big);
  });

  it('honours q=0 (gzip;q=0 → NOT compressed)', async () => {
    const r = await fetch(`${base}/big`, {
      headers: { 'accept-encoding': 'gzip;q=0' },
    });
    await r.json();
    asserts.assertEquals(r.headers.get('content-encoding'), null);
  });

  it('skips a HEAD request even over the threshold', async () => {
    const r = await fetch(`${base}/headbig`, {
      method: 'HEAD',
      headers: { 'accept-encoding': 'gzip' },
    });
    await r.arrayBuffer();
    asserts.assertEquals(r.status, 200);
    asserts.assertEquals(r.headers.get('content-encoding'), null);
  });

  it('skips a 204 no-body response', async () => {
    const r = await fetch(`${base}/nc`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    await r.arrayBuffer();
    asserts.assertEquals(r.status, 204);
    asserts.assertEquals(r.headers.get('content-encoding'), null);
  });

  it('REGRESSION: merges Vary with cors (Origin AND Accept-Encoding survive)', async () => {
    // cors() reflects the origin and appends `Vary: Origin`; compress must
    // MERGE Accept-Encoding into it, not replace it — a shared cache keyed
    // on only one would serve one origin/encoding its wrong variant.
    const app2 = await Application.initialize({
      name: 'compress-vary',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app2.use(cors(), compress());
    app2.get('/big', () => ({ content: { data: big } }));
    await app2.start();
    try {
      const r = await fetch(`http://127.0.0.1:${app2.port}/big`, {
        headers: {
          'accept-encoding': 'gzip',
          origin: 'https://a.example',
        },
      });
      asserts.assertEquals(r.headers.get('content-encoding'), 'gzip');
      const vary = r.headers.get('vary')!.toLowerCase();
      asserts.assert(vary.includes('origin'), `Vary missing origin: ${vary}`);
      asserts.assert(
        vary.includes('accept-encoding'),
        `Vary missing accept-encoding: ${vary}`,
      );
      asserts.assertEquals((await r.json()).data, big);
    } finally {
      await app2.stop();
    }
  });

  it('honors an explicit HIGH q-value (gzip;q=0.9 still compresses)', async () => {
    // The `q=0` disable must not false-match the `0` prefix of `q=0.9`.
    const r = await fetch(`${base}/big`, {
      headers: { 'accept-encoding': 'gzip;q=0.9' },
    });
    asserts.assertEquals(r.headers.get('content-encoding'), 'gzip');
    await r.arrayBuffer();
  });

  it('is HTTP-scoped', () => {
    asserts.assertEquals(middlewareScope(compress()), ['HTTP']);
  });
});

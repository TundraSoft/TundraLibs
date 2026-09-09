/**
 * @fileoverview compress — gzip/deflate negotiation, threshold, and type
 * gating. (fetch transparently decodes the body, so we assert on the
 * Content-Encoding header and that the decoded payload is intact.)
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { compress } from './compress.ts';
import { cors } from './cors.ts';
import { etag } from './etag.ts';
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
    app.get('/headbig', () => ({ content: { data: big } }));
    app.route('HEAD', '/headbig', () => ({ content: { data: big } }));
    // Large body on a 204 → only the NO_BODY status guard (not the size
    // guard) can be what skips it.
    app.get('/nc', () => ({
      status: 204,
      content: big,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }));
    // A partial response: Content-Range describes IDENTITY byte
    // positions — compression would corrupt resume/seek.
    app.get('/partial', () => ({
      status: 206,
      content: big.slice(0, 2000),
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-range': `bytes 0-1999/${big.length}`,
      },
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

  it('does nothing without an acceptable encoding — but still marks the response as varying', async () => {
    const r = await fetch(`${base}/big`, {
      headers: { 'accept-encoding': 'br' }, // brotli — unsupported here
    });
    await r.json();
    asserts.assertEquals(r.headers.get('content-encoding'), null);
    asserts.assertEquals(r.headers.get('vary'), 'Accept-Encoding');
    // A non-compressible type never varies.
    const bin = await fetch(`${base}/bin`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    await bin.arrayBuffer();
    asserts.assertEquals(bin.headers.get('vary'), null);
  });

  it('honours a wildcard: `*` alone means gzip; `gzip;q=0, *` falls to deflate; `*;q=0` means nothing', async () => {
    const cases: [string, string | null][] = [
      ['*', 'gzip'],
      ['identity;q=0.5, *;q=0.1', 'gzip'],
      ['gzip;q=0, *', 'deflate'],
      ['gzip;q=0, deflate;q=0, *', null],
      ['*;q=0', null],
    ];
    for (const [accept, expected] of cases) {
      const r = await fetch(`${base}/big`, {
        headers: { 'accept-encoding': accept },
      });
      await r.arrayBuffer();
      asserts.assertEquals(r.headers.get('content-encoding'), expected, accept);
    }
  });

  it('rejects a threshold that is not a non-negative integer at build', () => {
    for (const threshold of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      asserts.assertThrows(
        () => compress({ threshold }),
        RapidError,
        'threshold',
      );
    }
    compress({ threshold: 0 });
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

  it('skips a 206 partial response — Content-Range offsets are identity bytes', async () => {
    const r = await fetch(`${base}/partial`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    asserts.assertEquals(r.status, 206);
    asserts.assertEquals(r.headers.get('content-encoding'), null);
    asserts.assertEquals((await r.text()).length, 2000);
  });

  it('a HEAD carries the same encoding headers its GET would (RFC 9110 §9.3.2)', async () => {
    const get = await fetch(`${base}/headbig`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    await get.arrayBuffer();
    const head = await fetch(`${base}/headbig`, {
      method: 'HEAD',
      headers: { 'accept-encoding': 'gzip' },
    });
    await head.arrayBuffer();
    asserts.assertEquals(head.status, 200);
    asserts.assertEquals(head.headers.get('content-encoding'), 'gzip');
    asserts.assertEquals(head.headers.get('vary'), 'Accept-Encoding');
    asserts.assertEquals(
      head.headers.get('content-length'),
      get.headers.get('content-length'),
    );
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

describe('rapid.middlewares.compress — validators', () => {
  it('weakens a STRONG ETag once the body is encoded (RFC 9110 §8.8.3)', async () => {
    const app = await Application.initialize({
      name: 'compress-etag',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.use(compress(), etag()); // the documented order: etag hashes identity bytes
    app.get('/big', () => ({ content: { data: 'x'.repeat(5000) } }));
    const plain = await app.fetch(new Request('http://app/big'));
    const strong = plain.headers.get('etag')!;
    asserts.assert(
      strong.startsWith('"'),
      'identity response carries a strong tag',
    );
    await plain.body?.cancel();
    const gz = await app.fetch(
      new Request('http://app/big', { headers: { 'accept-encoding': 'gzip' } }),
    );
    asserts.assertEquals(gz.headers.get('content-encoding'), 'gzip');
    asserts.assertEquals(gz.headers.get('etag'), `W/${strong}`);
    await gz.body?.cancel();
    await app.stop();
  });
});

describe('rapid.middlewares.compress — serialisation cost', () => {
  it('serialises an object body exactly ONCE whether or not it ends up compressed', async () => {
    const app = await Application.initialize({
      name: 'compress-once',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    let stringified = 0;
    const counting = (size: number) => ({
      toJSON() {
        stringified++;
        return { data: 'x'.repeat(size) };
      },
    });
    app.use(compress());
    app.get('/big', () => ({ content: counting(5000) }));
    app.get('/small', () => ({ content: counting(10) }));
    try {
      // Compressed: once (compress's bytes ARE the body). Not negotiated:
      // once (only the serializer runs). Under the threshold: twice — the
      // size check needs the bytes and the serializer runs again; that is
      // the one remaining double, bounded by `threshold` bytes.
      for (
        const [path, accept, expected] of [
          ['/big', 'gzip', 1],
          ['/big', '', 1],
          ['/small', 'gzip', 2],
        ] as const
      ) {
        stringified = 0;
        const res = await app.fetch(
          new Request(`http://app${path}`, {
            headers: accept ? { 'accept-encoding': accept } : {},
          }),
        );
        await res.body?.cancel();
        asserts.assertEquals(stringified, expected, `${path} accept=${accept}`);
      }
    } finally {
      await app.stop();
    }
  });
});

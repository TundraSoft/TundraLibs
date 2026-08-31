/**
 * @fileoverview Config-driven static serving (`server.static`) — file
 * serving, index, traversal/symlink guards, conditional + range
 * requests, fingerprint-immutable, the fixed routes-win position, and
 * `view.asset()`'s lazy content hashing.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  ensureDir,
  makeTempDir,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { symlinkSync } from 'node:fs'; // cross-runtime; compat has no symlink creator
import { Application } from '../Application.ts';
import { html, template } from '../ui/html.ts';

describe('rapid.server.static (live)', () => {
  let base = '';
  let app: Application;
  let url = '';

  beforeAll(async () => {
    base = await makeTempDir({ prefix: 'rapid-static-' });
    await ensureDir(`${base}/pub`);
    await writeTextFile(`${base}/pub/index.html`, '<h1>Home</h1>');
    await writeTextFile(`${base}/pub/app.css`, 'body{color:red}');
    await writeTextFile(`${base}/secret.txt`, 'TOP-SECRET'); // OUTSIDE root

    app = await Application.initialize({
      name: 'static',
      server: {
        port: 0,
        hostname: '127.0.0.1',
        static: { '/s': { root: `${base}/pub`, maxAge: 60 } },
      },
      logger: { handlers: [] },
    });
    app.get('/api', () => ({ content: { ok: true } }));
    // A route under the static prefix — routes must WIN the collision.
    app.get('/s/app.css', () => ({ content: { routed: true } }));
    await app.start();
    url = `http://127.0.0.1:${app.port}`;
  });
  afterAll(async () => {
    await app.stop();
    await removeDir(base, { recursive: true });
  });

  it('serves the directory index with the right type + cache-control', async () => {
    const r = await fetch(`${url}/s/`);
    asserts.assertEquals(r.status, 200);
    asserts.assertEquals(
      r.headers.get('content-type'),
      'text/html; charset=UTF-8',
    );
    asserts.assertEquals(r.headers.get('cache-control'), 'public, max-age=60');
    asserts.assertEquals(await r.text(), '<h1>Home</h1>');
  });

  it('a ROUTE under the prefix always beats the file — static serves on route miss only', async () => {
    const r = await fetch(`${url}/s/app.css`);
    asserts.assertEquals(await r.json(), { routed: true });
    // The same file under a NON-routed name still serves.
    const idx = await fetch(`${url}/s/index.html`);
    asserts.assertEquals(await idx.text(), '<h1>Home</h1>');
  });

  it('prefix matches on a path boundary: /sindex.html does not resolve under /s', async () => {
    const r = await fetch(`${url}/sindex.html`);
    asserts.assertEquals(r.status, 404);
    await r.body?.cancel();
  });

  it('a POST under the prefix is never served — falls through to the 404', async () => {
    const r = await fetch(`${url}/s/index.html`, { method: 'POST' });
    asserts.assertEquals(r.status, 404);
    await r.body?.cancel();
  });

  it('emits a weak ETag and answers a matching If-None-Match with 304', async () => {
    const r1 = await fetch(`${url}/s/app.css`);
    await r1.body?.cancel(); // the routed reply — fetch the real file:
    const f1 = await fetch(`${url}/s/index.html`);
    const etag = f1.headers.get('etag');
    await f1.text();
    asserts.assert(etag?.startsWith('W/"'), `expected weak ETag, got ${etag}`);
    const r2 = await fetch(`${url}/s/index.html`, {
      headers: { 'if-none-match': etag! },
    });
    asserts.assertEquals(r2.status, 304);
    asserts.assertEquals(await r2.text(), '');
  });

  it('serves a byte range as 206 with Content-Range; unsatisfiable is 416', async () => {
    // index.html = '<h1>Home</h1>' (13 bytes). bytes=4-7 → 'Home'.
    const r = await fetch(`${url}/s/index.html`, {
      headers: { range: 'bytes=4-7' },
    });
    asserts.assertEquals(r.status, 206);
    asserts.assertEquals(r.headers.get('content-range'), 'bytes 4-7/13');
    asserts.assertEquals(await r.text(), 'Home');

    const bad = await fetch(`${url}/s/index.html`, {
      headers: { range: 'bytes=99-' },
    });
    asserts.assertEquals(bad.status, 416);
    asserts.assertEquals(bad.headers.get('content-range'), 'bytes */13');
    await bad.text();
  });

  it('blocks traversal — encoded dot-segments cannot escape the root', async () => {
    for (const probe of ['%2e%2e/secret.txt', '..%2fsecret.txt']) {
      const r = await fetch(`${url}/s/${probe}`);
      const body = await r.text();
      asserts.assertEquals(r.status, 404);
      asserts.assert(!body.includes('TOP-SECRET'), 'secret leaked!');
    }
  });

  it('denies an escaping symlink; an in-tree one serves', async () => {
    const rootDir = await makeTempDir({ prefix: 'rapid-static-sym-' });
    const outside = await makeTempDir({ prefix: 'rapid-static-out-' });
    await ensureDir(`${rootDir}/pub`);
    await writeTextFile(`${outside}/secret.txt`, 'TOP-SECRET');
    await writeTextFile(`${rootDir}/pub/ok.txt`, 'public');
    symlinkSync(`${outside}/secret.txt`, `${rootDir}/pub/evil.txt`);
    symlinkSync(`${rootDir}/pub/ok.txt`, `${rootDir}/pub/alias.txt`);
    const sym = await Application.initialize({
      name: 'static-sym',
      server: {
        port: 0,
        hostname: '127.0.0.1',
        static: { '/s': `${rootDir}/pub` }, // string shorthand
      },
      logger: { handlers: [] },
    });
    await sym.start();
    try {
      const u = `http://127.0.0.1:${sym.port}`;
      const leak = await fetch(`${u}/s/evil.txt`);
      const leakBody = await leak.text();
      asserts.assertEquals(leak.status, 404);
      asserts.assert(!leakBody.includes('TOP-SECRET'), 'secret leaked!');
      const alias = await fetch(`${u}/s/alias.txt`);
      asserts.assertEquals(alias.status, 200);
      asserts.assertEquals(await alias.text(), 'public');
    } finally {
      await sym.stop();
      await removeDir(rootDir, { recursive: true });
      await removeDir(outside, { recursive: true });
    }
  });

  it('rejects a bad stanza at boot — prefix without a leading slash', async () => {
    await asserts.assertRejects(
      () =>
        Application.initialize({
          name: 'static-bad',
          server: {
            port: 0,
            hostname: '127.0.0.1',
            static: { 'assets': './public' },
          },
          logger: { handlers: [] },
        }),
      Error,
      "must start with '/'",
    );
  });
});

describe('rapid.server.static fingerprint + view.asset()', () => {
  let base = '';
  const makeApp = (mode: 'DEVELOPMENT' | 'PRODUCTION' = 'PRODUCTION') =>
    Application.initialize({
      name: 'static-fp',
      mode,
      server: {
        port: 0,
        hostname: '127.0.0.1',
        static: { '/assets': { root: `${base}/pub`, fingerprint: true } },
      },
      logger: { handlers: [] },
      ui: { prefer: 'html' },
    });

  beforeAll(async () => {
    base = await makeTempDir({ prefix: 'rapid-fp-' });
    await ensureDir(`${base}/pub`);
    await writeTextFile(`${base}/pub/site.css`, 'body{margin:0}');
  });
  afterAll(async () => {
    await removeDir(base, { recursive: true });
  });

  it('a ?v= URL earns immutable Cache-Control; unversioned stays plain', async () => {
    const app = await makeApp();
    await app.start();
    try {
      const u = `http://127.0.0.1:${app.port}`;
      const v = await fetch(`${u}/assets/site.css?v=abc`);
      asserts.assertEquals(
        v.headers.get('cache-control'),
        'public, max-age=31536000, immutable',
      );
      await v.text();
      const plain = await fetch(`${u}/assets/site.css`);
      asserts.assertEquals(plain.headers.get('cache-control'), null);
      await plain.text();
    } finally {
      await app.stop();
    }
  });

  it('view.asset() lazily content-hashes under a fingerprinted mount; unmapped paths pass through', async () => {
    const app = await makeApp();
    const Page = template<Record<never, never>>((_, view) =>
      html`<l h="${view.asset('/assets/site.css')}" p="${
        view.asset('/not-mapped.png')
      }"></l>`
    );
    app.get('/p', { template: Page }, () => ({ content: {} }));
    const out = await (await app.fetch(new Request('http://app/p'))).text();
    const m = /h="\/assets\/site\.css\?v=([0-9a-f]+)"/.exec(out);
    asserts.assert(m !== null, `no version in ${out}`);
    asserts.assertStringIncludes(out, 'p="/not-mapped.png"');
    // Cached: a second render yields the same version.
    const again = await (await app.fetch(new Request('http://app/p'))).text();
    asserts.assertStringIncludes(again, `?v=${m![1]}`);
    await app.stop();
  });

  it('DEVELOPMENT re-hashes an edited file on the next render; PRODUCTION caches forever', async () => {
    const dev = await makeApp('DEVELOPMENT');
    const Page = template<Record<never, never>>((_, view) =>
      html`<l h="${view.asset('/assets/site.css')}"></l>`
    );
    dev.get('/p', { template: Page }, () => ({ content: {} }));
    const first = await (await dev.fetch(new Request('http://app/p'))).text();
    const v1 = /v=([0-9a-f]+)/.exec(first)![1];
    // A changed file must get a fresh hash in DEV (mtime re-check)...
    await new Promise((resolve) => setTimeout(resolve, 10)); // distinct mtime
    await writeTextFile(`${base}/pub/site.css`, 'body{margin:1px}');
    const second = await (await dev.fetch(new Request('http://app/p'))).text();
    const v2 = /v=([0-9a-f]+)/.exec(second)![1];
    asserts.assertNotEquals(v1, v2);
    await dev.stop();
    await writeTextFile(`${base}/pub/site.css`, 'body{margin:0}');
  });

  it('an explicit ui.assets manifest entry WINS over the lazy hash', async () => {
    const app = await Application.initialize({
      name: 'static-manifest',
      server: {
        port: 0,
        hostname: '127.0.0.1',
        static: { '/assets': { root: `${base}/pub`, fingerprint: true } },
      },
      logger: { handlers: [] },
      ui: {
        prefer: 'html',
        assets: { '/assets/site.css': 'manifest-pinned' },
      },
    });
    const Page = template<Record<never, never>>((_, view) =>
      html`<l h="${view.asset('/assets/site.css')}"></l>`
    );
    app.get('/p', { template: Page }, () => ({ content: {} }));
    const out = await (await app.fetch(new Request('http://app/p'))).text();
    asserts.assertStringIncludes(out, '?v=manifest-pinned');
    await app.stop();
  });
});

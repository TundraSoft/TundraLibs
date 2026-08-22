/**
 * @fileoverview serveStatic — file serving, index, fall-through, and the
 * path-traversal guard, over a live server.
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
import { symlinkSync } from 'node:fs'; // cross-runtime (Deno/Bun/Node); compat has no symlink creator
import { Application } from '../Application.ts';
import { serveStatic } from './serveStatic.ts';
import { middlewareScope } from './scope.ts';

describe('rapid.serveStatic (live)', () => {
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
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.use(serveStatic({ root: `${base}/pub`, prefix: '/s', maxAge: 60 }));
    app.get('/api', () => ({ content: { ok: true } }));
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

  it('serves a nested file by extension type', async () => {
    const r = await fetch(`${url}/s/app.css`);
    asserts.assertEquals(r.status, 200);
    asserts.assertEquals(
      r.headers.get('content-type'),
      'text/css; charset=UTF-8',
    );
    asserts.assertEquals(await r.text(), 'body{color:red}');
  });

  it('emits a weak ETag and answers a matching If-None-Match with 304', async () => {
    const r1 = await fetch(`${url}/s/app.css`);
    const etag = r1.headers.get('etag');
    await r1.text();
    asserts.assert(
      etag?.startsWith('W/"'),
      `expected a weak ETag, got ${etag}`,
    );
    asserts.assert(r1.headers.get('last-modified'), 'expected Last-Modified');

    const r2 = await fetch(`${url}/s/app.css`, {
      headers: { 'if-none-match': etag! },
    });
    asserts.assertEquals(r2.status, 304);
    asserts.assertEquals(await r2.text(), ''); // 304 carries no body
    asserts.assertEquals(r2.headers.get('etag'), etag); // still advertised
  });

  it('falls through for a missing file (404) and leaves routes working', async () => {
    const miss = await fetch(`${url}/s/nope.txt`);
    asserts.assertEquals(miss.status, 404);
    await miss.text();
    const api = await fetch(`${url}/api`); // route still handled
    asserts.assertEquals(api.status, 200);
    asserts.assertEquals((await api.json()).ok, true);
  });

  it('does not serve requests outside the prefix', async () => {
    const r = await fetch(`${url}/elsewhere/app.css`);
    asserts.assertEquals(r.status, 404);
    await r.text();
  });

  it('BLOCKS path traversal (plain and encoded) — never leaks outside root', async () => {
    for (
      const p of [
        '/s/../secret.txt',
        '/s/..%2fsecret.txt',
        '/s/%2e%2e/secret.txt',
      ]
    ) {
      const r = await fetch(`${url}${p}`);
      const body = await r.text();
      asserts.assertNotEquals(r.status, 200, `${p} must not 200`);
      asserts.assert(!body.includes('TOP-SECRET'), `${p} leaked the secret`);
    }
  });

  it('malformed percent-encoding falls through (decode catch → next)', async () => {
    // `%zz` is not a valid escape → decodeURIComponent throws → next().
    const r = await fetch(`${url}/s/%zz`);
    await r.text();
    asserts.assertEquals(r.status, 404);
    // A real route is still reachable — the chain wasn't broken.
    const api = await fetch(`${url}/api`);
    asserts.assertEquals(api.status, 200);
    asserts.assertEquals((await api.json()).ok, true);
  });

  it('index:false does not serve a directory request', async () => {
    const app2 = await Application.initialize({
      name: 'static-noindex',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app2.use(serveStatic({ root: `${base}/pub`, prefix: '/s', index: false }));
    app2.get('/api', () => ({ content: { ok: true } }));
    await app2.start();
    const u = `http://127.0.0.1:${app2.port}`;
    try {
      // Directory request → no index → falls through to 404.
      const dir = await fetch(`${u}/s/`);
      asserts.assertEquals(dir.status, 404);
      await dir.text();
      // A named file under the same prefix still serves.
      const file = await fetch(`${u}/s/app.css`);
      asserts.assertEquals(file.status, 200);
      asserts.assertEquals(await file.text(), 'body{color:red}');
    } finally {
      await app2.stop();
    }
  });

  it('blocks a symlink under root that ESCAPES it, but serves an in-tree symlink', async () => {
    const rootDir = await makeTempDir({ prefix: 'rapid-static-sym-' });
    const outside = await makeTempDir({ prefix: 'rapid-static-out-' });
    await writeTextFile(`${outside}/secret.txt`, 'TOP-SECRET');
    await writeTextFile(`${rootDir}/ok.txt`, 'public');
    // Escaping symlink INSIDE root → points out of the tree.
    symlinkSync(`${outside}/secret.txt`, `${rootDir}/evil.txt`);
    // In-tree symlink → points to a file that stays inside root.
    symlinkSync(`${rootDir}/ok.txt`, `${rootDir}/alias.txt`);

    const app = await Application.initialize({
      name: 'static-sym',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.use(serveStatic({ root: rootDir, prefix: '/s' }));
    await app.start();
    try {
      const u = `http://127.0.0.1:${app.port}`;
      // Escaping symlink → denied (falls through → 404); the secret is NOT served.
      const leak = await fetch(`${u}/s/evil.txt`);
      const leakBody = await leak.text();
      asserts.assertEquals(leak.status, 404);
      asserts.assert(!leakBody.includes('TOP-SECRET'), 'secret leaked!');
      // In-tree symlink → served normally.
      const alias = await fetch(`${u}/s/alias.txt`);
      asserts.assertEquals(alias.status, 200);
      asserts.assertEquals(await alias.text(), 'public');
    } finally {
      await app.stop();
      await removeDir(rootDir, { recursive: true });
      await removeDir(outside, { recursive: true });
    }
  });

  it('is HTTP-scoped', () => {
    asserts.assertEquals(
      middlewareScope(serveStatic({ root: '.', prefix: '/s' })),
      ['HTTP'],
    );
  });
});

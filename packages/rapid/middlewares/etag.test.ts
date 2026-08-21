/**
 * @fileoverview etag — content-hash ETag + conditional 304.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { compress } from './compress.ts';
import { etag } from './etag.ts';

describe('rapid.middlewares.etag', () => {
  let app: Application;
  let base = '';
  beforeAll(async () => {
    app = new Application({
      name: 'etag',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    app.use(etag());
    app.get('/x', () => ({ content: { hello: 'world' } }));
    app.post('/x', () => ({ content: { created: true } }));
    app.get('/str', () => ({ content: 'plain-string-body' }));
    app.get('/bin', () => ({
      content: new Uint8Array([1, 2, 3, 4, 5]),
      headers: { 'content-type': 'application/octet-stream' },
    }));
    app.get('/created', () => ({ status: 201, content: { created: true } }));
    await app.start();
    base = `http://127.0.0.1:${app.port}`;
  });
  afterAll(async () => {
    await app.stop();
  });

  it('stamps a strong ETag on a 200 GET', async () => {
    const r = await fetch(`${base}/x`);
    await r.text();
    const tag = r.headers.get('etag');
    asserts.assert(tag !== null && tag.startsWith('"') && tag.endsWith('"'));
  });

  it('If-None-Match with the tag → 304, no body', async () => {
    const first = await fetch(`${base}/x`);
    await first.text();
    const tag = first.headers.get('etag')!;

    const second = await fetch(`${base}/x`, {
      headers: { 'if-none-match': tag },
    });
    asserts.assertEquals(second.status, 304);
    asserts.assertEquals(await second.text(), '');

    // A stale tag still gets the full 200.
    const stale = await fetch(`${base}/x`, {
      headers: { 'if-none-match': '"nope"' },
    });
    asserts.assertEquals(stale.status, 200);
    await stale.text();
  });

  it('does not ETag a non-GET response', async () => {
    const r = await fetch(`${base}/x`, { method: 'POST' });
    await r.text();
    asserts.assertEquals(r.headers.get('etag'), null);
  });

  it('stamps an ETag for a string body and a Uint8Array body', async () => {
    const s = await fetch(`${base}/str`);
    await s.text();
    const sTag = s.headers.get('etag');
    asserts.assert(sTag !== null && sTag.startsWith('"') && sTag.endsWith('"'));

    const b = await fetch(`${base}/bin`);
    await b.arrayBuffer();
    const bTag = b.headers.get('etag');
    asserts.assert(bTag !== null && bTag.startsWith('"') && bTag.endsWith('"'));
  });

  it('If-None-Match: * → 304', async () => {
    const r = await fetch(`${base}/x`, { headers: { 'if-none-match': '*' } });
    asserts.assertEquals(r.status, 304);
    asserts.assertEquals(await r.text(), '');
  });

  it('If-None-Match with the weak (W/) form of the tag → 304', async () => {
    const first = await fetch(`${base}/x`);
    await first.text();
    const tag = first.headers.get('etag')!;
    const weak = await fetch(`${base}/x`, {
      headers: { 'if-none-match': `W/${tag}` },
    });
    asserts.assertEquals(weak.status, 304);
    asserts.assertEquals(await weak.text(), '');
  });

  it('If-None-Match with a comma-separated list containing the tag → 304', async () => {
    const first = await fetch(`${base}/x`);
    await first.text();
    const tag = first.headers.get('etag')!;
    const list = await fetch(`${base}/x`, {
      headers: { 'if-none-match': `"aaa", ${tag}, "bbb"` },
    });
    asserts.assertEquals(list.status, 304);
    asserts.assertEquals(await list.text(), '');
  });

  it('does not ETag a non-200 GET (201)', async () => {
    const r = await fetch(`${base}/created`);
    await r.text();
    asserts.assertEquals(r.status, 201);
    asserts.assertEquals(r.headers.get('etag'), null);
  });

  it('skips a response that is already content-encoded (compress ran first)', async () => {
    // etag OUTSIDE compress: compress encodes the body and stamps
    // content-encoding on the way out, so etag must NOT hash the
    // compressed bytes.
    const enc = new Application({
      name: 'etag-enc',
      server: { port: 0, hostname: '127.0.0.1' },
    });
    enc.use(etag(), compress());
    enc.get('/big', () => ({ content: { data: 'y'.repeat(5000) } }));
    await enc.start();
    try {
      const r = await fetch(`http://127.0.0.1:${enc.port}/big`, {
        headers: { 'accept-encoding': 'gzip' },
      });
      await r.json();
      asserts.assertEquals(r.headers.get('content-encoding'), 'gzip');
      asserts.assertEquals(r.headers.get('etag'), null);
    } finally {
      await enc.stop();
    }
  });
});

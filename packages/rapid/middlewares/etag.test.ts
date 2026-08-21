/**
 * @fileoverview etag — content-hash ETag + conditional 304.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
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
});

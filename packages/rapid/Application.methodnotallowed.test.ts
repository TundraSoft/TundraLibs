/**
 * @fileoverview `server.methodNotAllowed` — when a path matches under other
 * methods, answer 405 + Allow (and generic OPTIONS → 204 + Allow) instead of
 * 404. Off (default) → a wrong method is a plain 404, hiding the path.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from './Application.ts';

const make = async (methodNotAllowed: boolean, autoHead = false) => {
  const app = await Application.initialize({
    name: 'mna',
    server: { port: 0, hostname: '127.0.0.1', methodNotAllowed, autoHead },
  });
  app.get('/thing', () => ({ content: 'ok' }));
  app.post('/thing', () => ({ content: 'made' }));
  return app;
};

describe('rapid.Application methodNotAllowed', () => {
  it('on: a wrong method → 405 + Allow (path exists under other methods)', async () => {
    const app = await make(true); // autoHead off → deterministic Allow
    const res = await app.fetch(
      new Request('http://app/thing', { method: 'DELETE' }),
    );
    asserts.assertEquals(res.status, 405);
    const allow = res.headers.get('allow') ?? '';
    asserts.assert(allow.includes('GET'), `Allow missing GET: ${allow}`);
    asserts.assert(allow.includes('POST'), `Allow missing POST: ${allow}`);
    asserts.assert(
      allow.includes('OPTIONS'),
      `Allow missing OPTIONS: ${allow}`,
    );
    const body = await res.json();
    asserts.assertEquals(body.code, 'RAPID_METHOD_NOT_ALLOWED');
    asserts.assert((body.details.allow as string[]).includes('GET'));
  });

  it('on: generic OPTIONS → 204 + Allow', async () => {
    const app = await make(true);
    const res = await app.fetch(
      new Request('http://app/thing', { method: 'OPTIONS' }),
    );
    asserts.assertEquals(res.status, 204);
    asserts.assert((res.headers.get('allow') ?? '').includes('GET'));
    await res.body?.cancel();
  });

  it('on: an unknown path is still 404 (not 405)', async () => {
    const app = await make(true);
    const res = await app.fetch(
      new Request('http://app/nope', { method: 'DELETE' }),
    );
    const body = await res.json();
    asserts.assertEquals(res.status, 404);
    asserts.assertEquals(body.code, 'RAPID_NOT_FOUND');
  });

  it('off (default): a wrong method → 404, hiding the path', async () => {
    const app = await make(false);
    const res = await app.fetch(
      new Request('http://app/thing', { method: 'DELETE' }),
    );
    const body = await res.json();
    asserts.assertEquals(res.status, 404);
    asserts.assertEquals(body.code, 'RAPID_NOT_FOUND');
  });

  it('Allow reflects the synthesized HEAD when autoHead is on', async () => {
    const app = await make(true, true); // methodNotAllowed + autoHead
    const res = await app.fetch(
      new Request('http://app/thing', { method: 'DELETE' }),
    );
    asserts.assertEquals(res.status, 405);
    asserts.assert((res.headers.get('allow') ?? '').includes('HEAD'));
    await res.body?.cancel();
  });
});
